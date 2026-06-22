const express = require("express");
const fs = require("fs");
const path = require("path");

// Live executor — required for stats only; never triggers trades from dashboard.
let liveExecutor = null;
try {
  liveExecutor = require("./live_executor");
} catch {
  // If live_executor.js is not present, dashboard still works.
}

const app = express();
const PORT = 3000;
const ROOT = __dirname;
const BANNER_FILE = path.join(ROOT, "3rd-floor-labz-banner.png");
const PAPER_FILE = path.join(ROOT, "paper_trades.json");
const NEAR_MISS_FILE = path.join(ROOT, "near_misses.json");
const FOLLOWUP_FILE = path.join(ROOT, "near_miss_followups.json");
const MONITOR_FILE = path.join(ROOT, "monitor.js");
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const LIVE_TRADES_FILE =
  liveExecutor?.FILES?.LIVE_TRADES_FILE || path.join(ROOT, "live_trades.jsonl");
const WALLET_STATUS_FILE = path.join(ROOT, "wallet_status.json");
const WALLET_HISTORY_FILE = path.join(ROOT, "wallet_history.jsonl");
const RPC_HEALTH_FILE = path.join(ROOT, "rpc_health.json");
const EMERGENCY_STOP_FILE = path.join(ROOT, "emergency_stop.js");
const LIVE_LOGGER_FILE = path.join(ROOT, "live_trade_logger.js");
const LIVE_EXECUTOR_FILE = path.join(ROOT, "live_executor.js");
const SIMULATION_RESULTS_FILE = path.join(ROOT, "simulation_results.json");
const STRATEGY_VERSION = "gmgn_v4";
const MONITOR_VERSION = "monitor_v4";
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = new Set(["WIN", "LOSS", "TIMEOUT"]);

function readJsonLines(file) {
  if (!fs.existsSync(file)) return { rows: [], invalid: 0 };

  let invalid = 0;
  const rows = fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        invalid += 1;
        return null;
      }
    })
    .filter(Boolean);

  return { rows, invalid };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "-";
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "-";
}

function formatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `$${Math.round(number).toLocaleString()}`
    : "-";
}

function formatSol(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(4)} SOL` : "-";
}

function formatDate(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "-";
}

function pnlClass(value) {
  const number = Number(value);
  if (number > 0) return "positive";
  if (number < 0) return "negative";
  return "";
}

function groupStats(trades, bucketFn, order) {
  const groups = new Map();

  for (const trade of trades) {
    const bucket = bucketFn(trade);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(trade);
  }

  return order
    .filter(bucket => groups.has(bucket))
    .map(bucket => {
      const list = groups.get(bucket);
      const pnl = list.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
      return {
        bucket,
        trades: list.length,
        wins: list.filter(trade => trade.status === "WIN").length,
        average: pnl / list.length,
        pnl
      };
    });
}

function botRateBucket(trade) {
  if (trade.botDegenRate === undefined || trade.botDegenRate === null) return "Missing";
  const rate = Number(trade.botDegenRate);
  if (rate < 0.05) return "0-5%";
  if (rate < 0.10) return "5-10%";
  if (rate < 0.15) return "10-15%";
  if (rate < 0.20) return "15-20%";
  return "20%+";
}

function marketCapBucket(trade) {
  if (trade.marketCap === undefined || trade.marketCap === null) return "Missing";
  const marketCap = Number(trade.marketCap);
  if (marketCap < 100000) return "<100k";
  if (marketCap < 250000) return "100k-250k";
  if (marketCap < 500000) return "250k-500k";
  if (marketCap < 1000000) return "500k-1M";
  return "1M+";
}

function validationSummary(trades, invalidRows) {
  const warnings = {
    INVALID_JSON: invalidRows,
    DUPLICATE_OPEN: 0,
    REENTRY_WITHIN_24H: 0,
    MISSING_VERSION: 0,
    MISSING_CLOSED_FIELD: 0,
    MONITOR_PAIR_TRACKING: 0
  };
  const byAddress = new Map();
  const openByAddress = new Map();
  const closedFields = ["triggerType", "triggerPrice", "exitPrice", "pnlPercent", "closedAt"];

  for (const trade of trades) {
    if (!trade.strategyVersion || !trade.monitorVersion) warnings.MISSING_VERSION += 1;

    if (CLOSED_STATUSES.has(trade.status)) {
      if (closedFields.some(field => trade[field] === undefined || trade[field] === null || trade[field] === "")) {
        warnings.MISSING_CLOSED_FIELD += 1;
      }
    }

    if (trade.address) {
      if (!byAddress.has(trade.address)) byAddress.set(trade.address, []);
      byAddress.get(trade.address).push(trade);
    }

    if (trade.status === "OPEN" && trade.address) {
      openByAddress.set(trade.address, (openByAddress.get(trade.address) || 0) + 1);
    }
  }

  warnings.DUPLICATE_OPEN = [...openByAddress.values()].filter(count => count > 1).length;

  for (const list of byAddress.values()) {
    const timestamps = list
      .map(trade => new Date(trade.timestamp).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    for (let index = 1; index < timestamps.length; index += 1) {
      if (timestamps[index] - timestamps[index - 1] < DAY_MS) {
        warnings.REENTRY_WITHIN_24H += 1;
      }
    }
  }

  if (!fs.existsSync(MONITOR_FILE)) {
    warnings.MONITOR_PAIR_TRACKING = 1;
  } else {
    const source = fs.readFileSync(MONITOR_FILE, "utf8");
    const valid =
      source.includes("getCurrentPrice(trade.pairAddress)") &&
      source.includes("/latest/dex/pairs/solana/${pairAddress}") &&
      !source.includes("/latest/dex/tokens/");
    warnings.MONITOR_PAIR_TRACKING = valid ? 0 : 1;
  }

  return warnings;
}

function followupSummary(followups) {
  const intervals = ["20m", "60m", "120m"];
  const summary = {
    total: followups.length,
    complete: 0,
    intervals: {}
  };

  for (const interval of intervals) {
    const values = followups
      .map(row => Number(row.measurements?.[interval]?.pnlPercent))
      .filter(Number.isFinite);
    summary.intervals[interval] = {
      measured: values.length,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      positive: values.filter(value => value > 0).length
    };
  }

  summary.complete = followups.filter(row =>
    intervals.every(interval => row.measurements?.[interval])
  ).length;

  return summary;
}

function statCard(label, value, cssClass = "") {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value ${cssClass}">${escapeHtml(value)}</div></div>`;
}

function brandHeader(context = "") {
  return `
    <section class="hero-banner">
      <div class="hero-art"></div>
      <div class="hero-overlay">
        <div class="brand">
          <div class="brand-mark">3F</div>
          <div>
            <h1>3rd Floor Labz</h1>
            <div class="brand-subtitle">Research <b>•</b> Automation <b>•</b> Alpha</div>
            <nav><a href="/">Terminal</a><a href="/winners">Winners Analysis</a></nav>
          </div>
        </div>
        <div class="header-right">
          <div class="engine-badge">GMGN Momentum Research Engine</div>
          <div class="system-online"><i></i>SYSTEM ONLINE</div>
          <div class="meta">Forward-Test Engine Status: ONLINE<br>Current Version: ${STRATEGY_VERSION} / ${MONITOR_VERSION}<br>${escapeHtml(context)}<br>Rendered ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
      </div>
    </section>
  `;
}

function systemStatusPanel() {
  return `
    <section class="system-status-panel">
      <div class="terminal-label">SYSTEM PROCESS MATRIX</div>
      <div class="status-grid">
        <div class="status-row"><span>SYSTEM STATUS</span><strong><i></i>ONLINE</strong></div>
        <div class="status-row"><span>SCANNER</span><strong><i></i>RUNNING</strong></div>
        <div class="status-row"><span>MONITOR</span><strong><i></i>RUNNING</strong></div>
        <div class="status-row"><span>FOLLOWUP</span><strong><i></i>RUNNING</strong></div>
        <div class="status-row"><span>DASHBOARD</span><strong><i></i>ACTIVE</strong></div>
      </div>
    </section>
  `;
}

function tradeRows(trades, includeClosedFields = false) {
  if (!trades.length) {
    return `<tr><td colspan="${includeClosedFields ? 9 : 8}" class="empty">No trades to show.</td></tr>`;
  }

  return trades.map(trade => `
    <tr>
      <td>${escapeHtml(trade.symbol || "UNKNOWN")}</td>
      <td><span class="status ${escapeHtml(String(trade.status || "").toLowerCase())}">${escapeHtml(trade.status)}</span></td>
      <td>${escapeHtml(trade.score ?? "-")}</td>
      <td>${formatMoney(trade.marketCap)}</td>
      <td>${formatPercent(Number(trade.botDegenRate) * 100)}</td>
      <td>${formatPercent(Number(trade.top10HolderRate) * 100)}</td>
      <td class="${pnlClass(trade.pnlPercent)}">${includeClosedFields ? formatPercent(trade.pnlPercent) : "-"}</td>
      ${includeClosedFields ? `<td>${escapeHtml(trade.triggerType || "-")}</td>` : ""}
      <td>${formatDate(includeClosedFields ? trade.closedAt : trade.timestamp)}</td>
    </tr>
  `).join("");
}

function bucketRows(rows) {
  if (!rows.length) return `<tr><td colspan="5" class="empty">No closed forward-test trades.</td></tr>`;

  return rows.map(row => `
    <tr>
      <td>${escapeHtml(row.bucket)}</td>
      <td>${row.trades}</td>
      <td>${formatPercent((row.wins / row.trades) * 100)}</td>
      <td class="${pnlClass(row.average)}">${formatPercent(row.average)}</td>
      <td class="${pnlClass(row.pnl)}">${formatPercent(row.pnl)}</td>
    </tr>
  `).join("");
}

function uniqueTokenAnalysis(trades) {
  const byAddress = new Map();

  for (const trade of trades) {
    if (!trade.address) continue;

    if (!byAddress.has(trade.address)) {
      byAddress.set(trade.address, {
        symbol: trade.symbol || "UNKNOWN",
        address: trade.address,
        tradeCount: 0,
        wins: 0,
        losses: 0,
        timeouts: 0,
        pnl: 0
      });
    }

    const token = byAddress.get(trade.address);
    token.tradeCount += 1;
    if (trade.status === "WIN") token.wins += 1;
    if (trade.status === "LOSS") token.losses += 1;
    if (trade.status === "TIMEOUT") token.timeouts += 1;
    if (CLOSED_STATUSES.has(trade.status) && Number.isFinite(Number(trade.pnlPercent))) {
      token.pnl += Number(trade.pnlPercent);
    }
  }

  const totalTrades = trades.length;
  const uniqueTokens = byAddress.size;
  const uniqueRatio = totalTrades ? uniqueTokens / totalTrades : 0;
  const reentryRate = totalTrades ? (totalTrades - uniqueTokens) / totalTrades : 0;

  return {
    totalTrades,
    uniqueTokens,
    uniqueRatio,
    reentryRate,
    mostTraded: [...byAddress.values()].sort(
      (a, b) => b.tradeCount - a.tradeCount || b.pnl - a.pnl
    )
  };
}

function mostTradedRows(tokens) {
  if (!tokens.length) {
    return `<tr><td colspan="7" class="empty">No trades to show.</td></tr>`;
  }

  return tokens.map(token => `
    <tr>
      <td>${escapeHtml(token.symbol)}</td>
      <td title="${escapeHtml(token.address)}">${escapeHtml(token.address)}</td>
      <td>${token.tradeCount}</td>
      <td>${token.wins}</td>
      <td>${token.losses}</td>
      <td>${token.timeouts}</td>
      <td class="${pnlClass(token.pnl)}">${formatPercent(token.pnl)}</td>
    </tr>
  `).join("");
}

function concentrationPanel(title, analysis) {
  const warning = analysis.totalTrades > 0 && analysis.uniqueRatio < 0.80
    ? `<div class="warning-banner">Warning: High re-entry concentration detected. Results may be dominated by repeat trades.</div>`
    : "";

  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      ${warning}
      <div class="mini-stats">
        <div><span>Trades</span><strong>${analysis.totalTrades}</strong></div>
        <div><span>Unique Tokens</span><strong>${analysis.uniqueTokens}</strong></div>
        <div><span>Unique Token Ratio</span><strong>${formatPercent(analysis.uniqueRatio * 100)}</strong></div>
        <div><span>Re-Entry Rate</span><strong>${formatPercent(analysis.reentryRate * 100)}</strong></div>
      </div>
      <h2 class="table-heading">Most Traded Tokens</h2>
      <div class="token-table-wrap">
        <table>
          <thead><tr><th>Symbol</th><th>Address</th><th>Trade Count</th><th>Wins</th><th>Losses</th><th>Timeouts</th><th>Total PnL</th></tr></thead>
          <tbody>${mostTradedRows(analysis.mostTraded)}</tbody>
        </table>
      </div>
    </section>
  `;
}

function matchesThesis(trade) {
  return thesisFailureReasons(trade).length === 0;
}

function thesisFailureReasons(trade) {
  const score = Number(trade.score);
  const botRate = Number(trade.botDegenRate);
  const marketCap = Number(trade.marketCap);
  const top10 = Number(trade.top10HolderRate);
  const reasons = [];

  if (!Number.isFinite(score) || score < 80 || score >= 90) {
    reasons.push("Score outside 80-89");
  }
  if (!Number.isFinite(botRate) || botRate >= 0.10) {
    reasons.push("Bot Rate >=10%");
  }
  if (!Number.isFinite(marketCap) || marketCap < 100000 || marketCap > 250000) {
    reasons.push("Market Cap outside 100k-250k");
  }
  if (!Number.isFinite(top10) || top10 < 0.10 || top10 > 0.30) {
    reasons.push("Top10 outside 10-30%");
  }

  return reasons;
}

function candidateThesisScore(trade) {
  return 4 - thesisFailureReasons(trade).length;
}

function candidateBadge(trade) {
  const thesisScore = candidateThesisScore(trade);
  const botRate = Number(trade.botDegenRate);
  const marketCap = Number(trade.marketCap);
  const top10 = Number(trade.top10HolderRate);
  const isHot =
    thesisScore === 4 &&
    botRate < 0.05 &&
    top10 >= 0.10 &&
    top10 <= 0.20 &&
    marketCap >= 100000 &&
    marketCap <= 250000;

  if (isHot) return { key: "hot", label: "🔥 HOT" };
  if (thesisScore === 4) return { key: "strong", label: "⚡ STRONG" };
  if (thesisScore === 3) return { key: "watch", label: "⚠ WATCH" };
  return { key: "weak", label: "❌ WEAK" };
}

function liveCandidateFeed(trades) {
  const recent = [...trades]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);
  const badgeCounts = recent.reduce((counts, trade) => {
    counts[candidateBadge(trade).key] += 1;
    return counts;
  }, { hot: 0, strong: 0, watch: 0, weak: 0 });
  const rows = recent.length
    ? recent.map(trade => {
      const thesisScore = candidateThesisScore(trade);
      const failedCriteria = 4 - thesisScore;
      const badge = candidateBadge(trade);
      const rowClass =
        failedCriteria === 0 ? "candidate-match" :
        failedCriteria === 1 ? "candidate-miss-one" :
        "candidate-miss-many";

      return `
        <tr class="${rowClass}">
          <td><span class="candidate-badge badge-${badge.key}">${badge.label}</span></td>
          <td>${escapeHtml(trade.symbol || "UNKNOWN")}</td>
          <td>${escapeHtml(trade.score ?? "-")}</td>
          <td><strong>${thesisScore}/4 (${thesisScore * 25}%)</strong></td>
          <td>${formatMoney(trade.marketCap)}</td>
          <td>${formatPercent(Number(trade.botDegenRate) * 100)}</td>
          <td>${formatPercent(Number(trade.top10HolderRate) * 100)}</td>
          <td>${formatMoney(trade.liquidity)}</td>
          <td>${escapeHtml(trade.source || "legacy")}</td>
          <td>${formatDate(trade.timestamp)}</td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="10" class="empty">No accepted candidates recorded.</td></tr>`;

  return `
    <section class="panel">
      <h2>Live Candidate Feed</h2>
      <div class="subtitle">Last 20 accepted candidates. Green matches all thesis criteria, yellow misses one, and red misses two or more.</div>
      <div class="candidate-summary">
        <div class="badge-hot"><span>🔥 HOT Candidates</span><strong>${badgeCounts.hot}</strong></div>
        <div class="badge-strong"><span>⚡ STRONG Candidates</span><strong>${badgeCounts.strong}</strong></div>
        <div class="badge-watch"><span>⚠ WATCH Candidates</span><strong>${badgeCounts.watch}</strong></div>
        <div class="badge-weak"><span>❌ WEAK Candidates</span><strong>${badgeCounts.weak}</strong></div>
      </div>
      <div class="token-table-wrap">
        <table>
          <thead><tr><th>Badge</th><th>Symbol</th><th>Score</th><th>Thesis Score</th><th>Market Cap</th><th>Bot Rate</th><th>Top10</th><th>Liquidity</th><th>Source</th><th>Time</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function positionSizeSimulator(closedTrades) {
  const capitals = [500, 1000, 5000, 10000];
  const riskFraction = 0.05;
  const chronological = [...closedTrades]
    .sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime());
  const confidence =
    chronological.length < 10 ? "LOW CONFIDENCE" :
    chronological.length < 25 ? "DEVELOPING" :
    chronological.length < 50 ? "MODERATE" :
    "HIGH";
  const confidenceClass =
    chronological.length < 10 ? "confidence-low" :
    chronological.length < 25 ? "confidence-developing" :
    chronological.length < 50 ? "confidence-moderate" :
    "confidence-high";
  const projectionClass = chronological.length < 25 ? "projection-deemphasized" : "";
  const projectionValue = value => chronological.length < 10
    ? `<details class="hidden-projection"><summary>Hidden</summary><span>${value}</span></details>`
    : value;
  const averagePnl = chronological.length
    ? chronological.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0) / chronological.length
    : 0;
  const wins = chronological.filter(trade => trade.status === "WIN").length;
  const losses = chronological.filter(trade => trade.status === "LOSS").length;
  const timeouts = chronological.filter(trade => trade.status === "TIMEOUT").length;
  const firstTime = chronological.length
    ? new Date(chronological[0].timestamp || chronological[0].closedAt).getTime()
    : NaN;
  const lastTime = chronological.length
    ? new Date(chronological[chronological.length - 1].closedAt).getTime()
    : NaN;
  const observedDays = Number.isFinite(firstTime) && Number.isFinite(lastTime)
    ? Math.max(1, (lastTime - firstTime) / (24 * 60 * 60 * 1000))
    : 1;
  const projectedTrades = chronological.length
    ? (chronological.length / observedDays) * 30
    : 0;
  const projectedWins = chronological.length ? projectedTrades * (wins / chronological.length) : 0;
  const projectedLosses = chronological.length ? projectedTrades * (losses / chronological.length) : 0;
  const projectedTimeouts = chronological.length ? projectedTrades * (timeouts / chronological.length) : 0;

  const rows = capitals.map(capital => {
    let equity = capital;
    let peak = capital;
    let maxDrawdown = 0;

    for (const trade of chronological) {
      equity *= 1 + (riskFraction * Number(trade.pnlPercent) / 100);
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }

    const expectedMonthlyPnl = capital * riskFraction * (averagePnl / 100) * projectedTrades;
    const growth = equity - capital;
    const maxDrawdownPercent = peak ? (maxDrawdown / peak) * 100 : 0;

    return `
      <tr>
        <td>${formatMoney(capital)}</td>
        <td>${formatMoney(capital * riskFraction)}</td>
        <td class="${projectionClass} ${pnlClass(expectedMonthlyPnl)}">${projectionValue(formatMoney(expectedMonthlyPnl))}</td>
        <td class="negative">${formatMoney(maxDrawdown)} (${formatPercent(maxDrawdownPercent)})</td>
        <td class="${projectionClass}">${projectionValue(`${projectedWins.toFixed(1)} W / ${projectedLosses.toFixed(1)} L / ${projectedTimeouts.toFixed(1)} T`)}</td>
        <td class="${pnlClass(growth)}">${formatMoney(equity)} (${formatPercent((growth / capital) * 100)})</td>
      </tr>
    `;
  }).join("");

  return `
    <section class="panel">
      <h2>Position Size Simulator</h2>
      <div class="subtitle">Uses closed ${STRATEGY_VERSION} / ${MONITOR_VERSION} trades. Risk per trade means 5% of current equity allocated to each position. Monthly projection uses the observed trade rate over a 30-day period.</div>
      ${chronological.length < 10 ? `<div class="warning-banner">Sample size too small for reliable monthly projections.</div>` : ""}
      <div class="mini-stats simulator-stats">
        <div><span>Risk Per Trade</span><strong>5%</strong></div>
        <div><span>Closed Sample</span><strong>${chronological.length}</strong></div>
        <div><span>Confidence Level</span><strong class="${confidenceClass}">${confidence}</strong></div>
        <div><span>Average Trade PnL</span><strong class="${pnlClass(averagePnl)}">${formatPercent(averagePnl)}</strong></div>
        <div class="${projectionClass}"><span>Projected Monthly Trades</span><strong>${projectionValue(projectedTrades.toFixed(1))}</strong></div>
      </div>
      <div class="token-table-wrap">
        <table>
          <thead><tr><th>Capital</th><th>Position Size</th><th class="${projectionClass}">Expected Monthly PnL</th><th>Max Drawdown</th><th class="${projectionClass}">Monthly Win/Loss Projection</th><th>Compounded Growth</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function solTradeSimulator(closedTrades, settings) {
  const positionSizeSol = settings.positionSizeSol;
  const feePercent = settings.feePercent;
  const simulated = closedTrades.map(trade => {
    const grossSolPnl = positionSizeSol * (Number(trade.pnlPercent) / 100);
    const estimatedFee = positionSizeSol * (feePercent / 100);
    return {
      ...trade,
      grossSolPnl,
      estimatedFee,
      netSolPnl: grossSolPnl - estimatedFee
    };
  });
  const summarize = trades => {
    const gross = trades.reduce((sum, trade) => sum + trade.grossSolPnl, 0);
    const fees = trades.reduce((sum, trade) => sum + trade.estimatedFee, 0);
    const net = trades.reduce((sum, trade) => sum + trade.netSolPnl, 0);
    return {
      trades: trades.length,
      gross,
      fees,
      net,
      average: trades.length ? net / trades.length : 0
    };
  };
  const total = summarize(simulated);
  const thesis = summarize(simulated.filter(matchesThesis));
  const nonThesis = summarize(simulated.filter(trade => !matchesThesis(trade)));
  const wins = simulated.filter(trade => trade.status === "WIN").length;
  const losses = simulated.filter(trade => trade.status === "LOSS").length;
  const timeouts = simulated.filter(trade => trade.status === "TIMEOUT").length;
  const groupRows = [
    ["Thesis Match", thesis],
    ["Non-Thesis", nonThesis]
  ].map(([label, group]) => `
    <tr>
      <td>${label}</td>
      <td>${group.trades}</td>
      <td class="${pnlClass(group.gross)}">${formatSol(group.gross)}</td>
      <td class="${pnlClass(group.net)}">${formatSol(group.net)}</td>
      <td class="${pnlClass(group.average)}">${formatSol(group.average)}</td>
    </tr>
  `).join("");
  const recentRows = simulated.slice(0, 20).map(trade => `
    <tr>
      <td>${escapeHtml(trade.symbol || "UNKNOWN")}</td>
      <td><span class="status ${String(trade.status).toLowerCase()}">${escapeHtml(trade.status)}</span></td>
      <td>${matchesThesis(trade) ? "Yes" : "No"}</td>
      <td class="${pnlClass(trade.pnlPercent)}">${formatPercent(trade.pnlPercent)}</td>
      <td class="${pnlClass(trade.grossSolPnl)}">${formatSol(trade.grossSolPnl)}</td>
      <td class="${pnlClass(trade.netSolPnl)}">${formatSol(trade.netSolPnl)}</td>
      <td>${escapeHtml(trade.triggerType || "-")}</td>
      <td>${formatDate(trade.closedAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="8" class="empty">No closed forward-test trades.</td></tr>`;

  return `
    <section class="panel">
      <h2>1 SOL Trade Simulator</h2>
      <div class="subtitle">Closed ${STRATEGY_VERSION} / ${MONITOR_VERSION} trades only. Each simulated round trip subtracts the configured fee/slippage percentage from the position size.</div>
      <form class="simulator-form" method="get" action="/">
        <label>Position Size SOL<input name="positionSol" type="number" min="0.0001" step="0.1" value="${positionSizeSol}"></label>
        <label>Fee/Slippage Per Round Trip %<input name="feePercent" type="number" min="0" step="0.1" value="${feePercent}"></label>
        <button type="submit">Update Simulation</button>
      </form>
      <div class="cards sol-simulator-cards">
        ${statCard("Position Size", formatSol(positionSizeSol))}
        ${statCard("Closed Trades", total.trades)}
        ${statCard("Wins / Losses / Timeouts", `${wins} / ${losses} / ${timeouts}`)}
        ${statCard("Gross SOL PnL", formatSol(total.gross), pnlClass(total.gross))}
        ${statCard("Average SOL PnL Per Trade", formatSol(total.trades ? total.gross / total.trades : 0), pnlClass(total.gross))}
        ${statCard("Estimated Fees / Slippage", formatSol(total.fees), "negative")}
        ${statCard("Net SOL PnL", formatSol(total.net), pnlClass(total.net))}
      </div>
      <h2 class="table-heading">Thesis vs Non-Thesis Simulator</h2>
      <table>
        <thead><tr><th>Group</th><th>Trades</th><th>Gross SOL PnL</th><th>Net SOL PnL</th><th>Average SOL Per Trade</th></tr></thead>
        <tbody>${groupRows}</tbody>
      </table>
      <h2 class="table-heading simulator-recent-heading">Recent Simulated Trades</h2>
      <div class="token-table-wrap">
        <table>
          <thead><tr><th>Symbol</th><th>Status</th><th>Thesis Match</th><th>PnL %</th><th>Gross SOL</th><th>Net SOL</th><th>Trigger Type</th><th>Closed Time</th></tr></thead>
          <tbody>${recentRows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function thesisGroupStats(trades) {
  const closed = trades.filter(trade =>
    CLOSED_STATUSES.has(trade.status) &&
    Number.isFinite(Number(trade.pnlPercent))
  );
  const pnl = closed.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
  const wins = closed.filter(trade => trade.status === "WIN").length;

  return {
    trades: trades.length,
    closed: closed.length,
    pnl,
    winRate: closed.length ? (wins / closed.length) * 100 : 0
  };
}

function thesisPanel(forwardTrades) {
  const matchingTrades = forwardTrades.filter(matchesThesis);
  const nonMatchingTrades = forwardTrades.filter(trade => !matchesThesis(trade));
  const matching = thesisGroupStats(matchingTrades);
  const nonMatching = thesisGroupStats(nonMatchingTrades);
  const matchPercentage = forwardTrades.length
    ? (matchingTrades.length / forwardTrades.length) * 100
    : 0;
  const failureCounts = {
    marketCap: nonMatchingTrades.filter(trade =>
      thesisFailureReasons(trade).includes("Market Cap outside 100k-250k")
    ).length,
    botRate: nonMatchingTrades.filter(trade =>
      thesisFailureReasons(trade).includes("Bot Rate >=10%")
    ).length,
    score: nonMatchingTrades.filter(trade =>
      thesisFailureReasons(trade).includes("Score outside 80-89")
    ).length,
    top10: nonMatchingTrades.filter(trade =>
      thesisFailureReasons(trade).includes("Top10 outside 10-30%")
    ).length
  };
  const nonThesisRows = nonMatchingTrades.length
    ? nonMatchingTrades.map(trade => `
      <tr>
        <td>${escapeHtml(trade.symbol || "UNKNOWN")}</td>
        <td>${escapeHtml(trade.status || "-")}</td>
        <td>${escapeHtml(trade.score ?? "-")}</td>
        <td>${formatPercent(Number(trade.botDegenRate) * 100)}</td>
        <td>${formatMoney(trade.marketCap)}</td>
        <td>${formatPercent(Number(trade.top10HolderRate) * 100)}</td>
        <td class="${pnlClass(trade.pnlPercent)}">${CLOSED_STATUSES.has(trade.status) ? formatPercent(trade.pnlPercent) : "-"}</td>
        <td class="failure-reasons">${thesisFailureReasons(trade).map(reason => `<span>${escapeHtml(reason)}</span>`).join("")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="empty">No non-thesis forward trades.</td></tr>`;

  return `
    <section class="panel">
      <h2>Thesis Match</h2>
      <div class="subtitle">Score 80-89 | Bot Rate &lt;10% | Market Cap $100k-$250k | Top10 10-30%. PnL and win rate use closed trades only.</div>
      <div class="cards thesis-cards">
        ${statCard("Match Percentage", formatPercent(matchPercentage))}
        ${statCard("Thesis-Matching Forward Trades", matching.trades)}
        ${statCard("Non-Thesis Forward Trades", nonMatching.trades)}
      </div>
      <table>
        <thead><tr><th>Group</th><th>Forward Trades</th><th>Closed Trades</th><th>Win Rate</th><th>Summed PnL</th></tr></thead>
        <tbody>
          <tr><td>Thesis Matching</td><td>${matching.trades}</td><td>${matching.closed}</td><td>${formatPercent(matching.winRate)}</td><td class="${pnlClass(matching.pnl)}">${formatPercent(matching.pnl)}</td></tr>
          <tr><td>Non-Thesis</td><td>${nonMatching.trades}</td><td>${nonMatching.closed}</td><td>${formatPercent(nonMatching.winRate)}</td><td class="${pnlClass(nonMatching.pnl)}">${formatPercent(nonMatching.pnl)}</td></tr>
        </tbody>
      </table>
      <h2 class="table-heading">Why Non-Thesis?</h2>
      <div class="subtitle">A trade may fail multiple criteria, so summary counts can overlap.</div>
      <div class="mini-stats failure-stats">
        <div><span>Market Cap Failed</span><strong>${failureCounts.marketCap}</strong></div>
        <div><span>Bot Rate Failed</span><strong>${failureCounts.botRate}</strong></div>
        <div><span>Score Failed</span><strong>${failureCounts.score}</strong></div>
        <div><span>Top10 Failed</span><strong>${failureCounts.top10}</strong></div>
      </div>
      <div class="token-table-wrap">
        <table>
          <thead><tr><th>Symbol</th><th>Status</th><th>Score</th><th>Bot Rate</th><th>Market Cap</th><th>Top10</th><th>PnL</th><th>Failed Criteria</th></tr></thead>
          <tbody>${nonThesisRows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function idealSetupWatch(forwardTrades) {
  const idealTrades = forwardTrades.filter(matchesThesis);
  const nonIdealTrades = forwardTrades.filter(trade => !matchesThesis(trade));
  const openIdeal = idealTrades.filter(trade => trade.status === "OPEN").length;
  const closedIdeal = idealTrades.filter(trade =>
    CLOSED_STATUSES.has(trade.status) &&
    Number.isFinite(Number(trade.pnlPercent))
  );
  const closedNonIdeal = nonIdealTrades.filter(trade =>
    CLOSED_STATUSES.has(trade.status) &&
    Number.isFinite(Number(trade.pnlPercent))
  );
  const idealPnl = closedIdeal.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
  const nonIdealPnl = closedNonIdeal.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
  const milestone = [10, 25, 50].find(target => closedIdeal.length < target);
  const milestoneText = milestone
    ? `${closedIdeal.length} / ${milestone}`
    : `${closedIdeal.length} / 50 complete`;

  return `
    <section class="panel">
      <h2>Ideal Setup Watch</h2>
      <div class="subtitle">Score 80-89 | Bot &lt;10% | Market Cap $100k-$250k | Top10 10-30%. Milestones use closed ideal forward-test trades.</div>
      <div class="cards ideal-watch-cards">
        ${statCard("Open Ideal Trades", openIdeal)}
        ${statCard("Closed Ideal Trades", closedIdeal.length)}
        ${statCard("Ideal PnL", formatPercent(idealPnl), pnlClass(idealPnl))}
        ${statCard("Non-Ideal PnL", formatPercent(nonIdealPnl), pnlClass(nonIdealPnl))}
        ${statCard("Next Milestone", milestoneText)}
      </div>
    </section>
  `;
}

function researchScorecard(forwardTrades) {
  const closed = forwardTrades.filter(trade =>
    CLOSED_STATUSES.has(trade.status) &&
    Number.isFinite(Number(trade.pnlPercent))
  );
  const ideal = closed.filter(matchesThesis);
  const nonIdeal = closed.filter(trade => !matchesThesis(trade));
  const idealPnl = ideal.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
  const nonIdealPnl = nonIdeal.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
  const confidence =
    ideal.length < 10 ? "LOW" :
    ideal.length < 25 ? "DEVELOPING" :
    ideal.length < 50 ? "MODERATE" :
    "HIGH";
  const status = ideal.length < 25 ? "PRELIMINARY" : "TARGET REACHED";

  return `
    <section class="research-scorecard">
      <div class="scorecard-title">
        <span>Research Scorecard</span>
        <strong>THESIS VALIDATION</strong>
      </div>
      <div class="scorecard-grid">
        <div><span>Ideal Trades</span><strong>${ideal.length}</strong></div>
        <div><span>Non-Ideal Trades</span><strong>${nonIdeal.length}</strong></div>
        <div><span>Ideal PnL</span><strong class="${pnlClass(idealPnl)}">${formatPercent(idealPnl)}</strong></div>
        <div><span>Non-Ideal PnL</span><strong class="${pnlClass(nonIdealPnl)}">${formatPercent(nonIdealPnl)}</strong></div>
        <div><span>Status</span><strong>${status}</strong></div>
        <div><span>Confidence</span><strong class="confidence confidence-${confidence.toLowerCase()}">${confidence}</strong></div>
        <div><span>Target Sample</span><strong>25 Ideal Trades</strong></div>
      </div>
    </section>
  `;
}

function opportunityFunnel(nearMisses, forwardTrades) {
  const currentNearMisses = nearMisses.filter(nearMiss =>
    nearMiss.strategyVersion === STRATEGY_VERSION
  );
  const closed = forwardTrades.filter(trade =>
    CLOSED_STATUSES.has(trade.status) &&
    Number.isFinite(Number(trade.pnlPercent))
  );
  const stages = [
    ["Near Misses", currentNearMisses.length],
    ["Passed Filters", forwardTrades.length],
    ["Paper Trades", forwardTrades.length],
    ["Closed Trades", closed.length],
    ["Wins", closed.filter(trade => trade.status === "WIN").length],
    ["Losses", closed.filter(trade => trade.status === "LOSS").length],
    ["Timeouts", closed.filter(trade => trade.status === "TIMEOUT").length]
  ];

  return `
    <section class="panel">
      <h2>Opportunity Funnel</h2>
      <div class="subtitle">Current version only: ${STRATEGY_VERSION} / ${MONITOR_VERSION}. Passed filters equal paper trades because accepted candidates are persisted only when a paper trade is created.</div>
      <div class="funnel-grid">
        ${stages.map(([label, value], index) => `
          <div class="funnel-stage">
            <span>${escapeHtml(label)}</span>
            <strong>${value}</strong>
            ${index < stages.length - 1 ? `<i>→</i>` : ""}
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function marketCapThesisBucket(trade) {
  const marketCap = Number(trade.marketCap);

  if (!Number.isFinite(marketCap) || marketCap < 100000) return null;
  if (marketCap <= 250000) return "100k-250k";
  if (marketCap < 500000) return "250k-500k";
  if (marketCap < 1000000) return "500k-1M";
  return "1M+";
}

function marketCapThesisWatch(forwardTrades) {
  const buckets = ["100k-250k", "250k-500k", "500k-1M", "1M+"];
  const rows = buckets.map(bucket => {
    const trades = forwardTrades.filter(trade => marketCapThesisBucket(trade) === bucket);
    const closed = trades.filter(trade =>
      CLOSED_STATUSES.has(trade.status) &&
      Number.isFinite(Number(trade.pnlPercent))
    );
    const pnl = closed.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
    const wins = closed.filter(trade => trade.status === "WIN").length;

    return {
      bucket,
      trades: trades.length,
      closed: closed.length,
      winRate: closed.length ? (wins / closed.length) * 100 : 0,
      pnl,
      average: closed.length ? pnl / closed.length : 0
    };
  });

  return `
    <section class="panel">
      <h2>Market Cap Thesis Watch</h2>
      <div class="subtitle">Forward-test trades only. Total trades include open positions; win rate and PnL use closed trades only.</div>
      <table>
        <thead><tr><th>Market Cap Group</th><th>Total Trades</th><th>Closed Trades</th><th>Win Rate</th><th>Summed PnL</th><th>Average PnL</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${row.bucket}</td>
              <td>${row.trades}</td>
              <td>${row.closed}</td>
              <td>${formatPercent(row.winRate)}</td>
              <td class="${pnlClass(row.pnl)}">${formatPercent(row.pnl)}</td>
              <td class="${pnlClass(row.average)}">${formatPercent(row.average)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function winnerLoserAverages(trades) {
  const average = field => {
    const values = trades
      .filter(trade => trade[field] !== undefined && trade[field] !== null && trade[field] !== "")
      .map(trade => Number(trade[field]))
      .filter(Number.isFinite);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };

  return {
    count: trades.length,
    score: average("score"),
    botDegenRate: average("botDegenRate"),
    marketCap: average("marketCap"),
    top10HolderRate: average("top10HolderRate"),
    liquidity: average("liquidity"),
    pnlPercent: average("pnlPercent")
  };
}

function winnerLoserRows(trades) {
  if (!trades.length) {
    return `<tr><td colspan="9" class="empty">No trades to show.</td></tr>`;
  }

  return trades.map((trade, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(trade.symbol || "UNKNOWN")}</td>
      <td>${escapeHtml(trade.score ?? "-")}</td>
      <td>${formatPercent(Number(trade.botDegenRate) * 100)}</td>
      <td>${formatMoney(trade.marketCap)}</td>
      <td>${formatPercent(Number(trade.top10HolderRate) * 100)}</td>
      <td>${formatMoney(trade.liquidity)}</td>
      <td>${escapeHtml(trade.source || "legacy")}</td>
      <td class="${pnlClass(trade.pnlPercent)}">${formatPercent(trade.pnlPercent)}</td>
    </tr>
  `).join("");
}

function comparisonRows(winners, losers) {
  const metrics = [
    ["Trade Count", "count", value => String(value)],
    ["Average Score", "score", value => formatNumber(value)],
    ["Average Bot Rate", "botDegenRate", value => formatPercent(value * 100)],
    ["Average Market Cap", "marketCap", value => formatMoney(value)],
    ["Average Top10", "top10HolderRate", value => formatPercent(value * 100)],
    ["Average Liquidity", "liquidity", value => formatMoney(value)],
    ["Average PnL", "pnlPercent", value => formatPercent(value)]
  ];

  return metrics.map(([label, field, formatter]) => `
    <tr>
      <td>${label}</td>
      <td class="${field === "pnlPercent" ? "positive" : ""}">${winners[field] === null ? "-" : formatter(winners[field])}</td>
      <td class="${field === "pnlPercent" ? "negative" : ""}">${losers[field] === null ? "-" : formatter(losers[field])}</td>
    </tr>
  `).join("");
}

// ─── RPC source visibility (Q9 — mirror wallet_monitor.js / live_executor.js env priority) ─

const PUBLIC_SOLANA_RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";
const PUBLIC_SOLANA_RPC_HOSTNAMES = new Set([
  "api.mainnet-beta.solana.com",
  "api.devnet.solana.com",
  "api.testnet.solana.com"
]);

function isPublicSolanaRpcEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) return false;
  try {
    return PUBLIC_SOLANA_RPC_HOSTNAMES.has(new URL(endpoint.trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function redactRpcUrl(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) return "—";
  return endpoint
    .replace(/((?:[?&]|\b)(?:api[-_]?key|apikey|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/api-key=[^&\s]+/gi, "api-key=[REDACTED]");
}

function rpcEndpointHost(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return redactRpcUrl(endpoint);
  }
}

function rpcCandidatesWalletMonitor() {
  return [
    ["HELIUS_RPC_URL", process.env.HELIUS_RPC_URL],
    ["HELIUS_API_KEY_DERIVED", process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`
      : null],
    ["SOLANA_RPC_URL", process.env.SOLANA_RPC_URL]
  ];
}

function rpcCandidatesExecutor() {
  return [
    ["HELIUS_RPC_URL", process.env.HELIUS_RPC_URL],
    ["SOLANA_RPC_URL", process.env.SOLANA_RPC_URL],
    ["HELIUS_API_KEY_DERIVED", process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`
      : null]
  ];
}

function resolveRpcSourceForDisplay({ requireDedicated = false, candidates } = {}) {
  const list = candidates || rpcCandidatesExecutor();
  const selected = list.find(([, endpoint]) => endpoint && !isPublicSolanaRpcEndpoint(endpoint));
  if (!selected) {
    if (requireDedicated) {
      return {
        provider: null,
        publicFallbackUsed: false,
        dedicatedMissing: true,
        displayLabel: "No dedicated RPC configured"
      };
    }
    return {
      provider: "PUBLIC_FALLBACK",
      publicFallbackUsed: true,
      dedicatedMissing: false,
      displayLabel: `PUBLIC_FALLBACK · ${rpcEndpointHost(PUBLIC_SOLANA_RPC_ENDPOINT)}`
    };
  }
  return {
    provider: selected[0],
    publicFallbackUsed: false,
    dedicatedMissing: false,
    displayLabel: `${selected[0]} · ${rpcEndpointHost(selected[1])}`
  };
}

function rpcVisibilityContext() {
  const walletMonitor = resolveRpcSourceForDisplay({
    requireDedicated: false,
    candidates: rpcCandidatesWalletMonitor()
  });
  const pipelineSimulation = resolveRpcSourceForDisplay({
    requireDedicated: true,
    candidates: rpcCandidatesExecutor()
  });
  const warnings = [];
  if (walletMonitor.publicFallbackUsed) {
    warnings.push(
      `<div class="wc-rpc-warn">⚠ Public Solana RPC in use for wallet balance reads — rate limits may cause false DISCONNECTED status. Set <code>HELIUS_RPC_URL</code> or <code>SOLANA_RPC_URL</code> in <code>.env</code>.</div>`
    );
  }
  if (pipelineSimulation.dedicatedMissing) {
    warnings.push(
      `<div class="wc-rpc-warn">⚠ No dedicated RPC configured for pipeline simulation — executor RPC stages would abort until a non-public <code>HELIUS_RPC_URL</code>, derived Helius key, or <code>SOLANA_RPC_URL</code> is set.</div>`
    );
  }
  return { walletMonitor, pipelineSimulation, warningsHtml: warnings.join("") };
}

function rpcSourceValueCls(source) {
  if (source.publicFallbackUsed || source.dedicatedMissing) return "wc-warn";
  return "wc-pos";
}

// ─── Wallet Connection Status Panel ───────────────────────────────────────────

function walletConnectionPanel() {
  let status = null, statusError = null;
  try {
    if (fs.existsSync(WALLET_STATUS_FILE)) status = JSON.parse(fs.readFileSync(WALLET_STATUS_FILE, "utf8"));
  } catch (err) { statusError = err.message; }

  // Health indicator: GREEN connected <500ms, YELLOW connected >=500ms, RED disconnected.
  let health = { cls: "wc-red", label: "RED — DISCONNECTED" };
  if (status && status.connected) {
    if (Number.isFinite(Number(status.latencyMs)) && Number(status.latencyMs) < 500) {
      health = { cls: "wc-green", label: "GREEN — HEALTHY" };
    } else {
      health = { cls: "wc-yellow", label: "YELLOW — SLOW RPC" };
    }
  }

  // Staleness note — monitor writes every 30s; warn if last update is old.
  let staleNote = "";
  if (status && status.updatedAt) {
    const ageSec = (Date.now() - new Date(status.updatedAt).getTime()) / 1000;
    if (ageSec > 120) {
      staleNote = `<div class="wc-stale">⚠ Last update ${Math.round(ageSec)}s ago — is wallet_monitor.js running?</div>`;
    }
  }

  // Balance history aggregates.
  let lowest = null, highest = null, current = null, delta = null, snapshots = 0;
  try {
    if (fs.existsSync(WALLET_HISTORY_FILE)) {
      const balances = fs.readFileSync(WALLET_HISTORY_FILE, "utf8")
        .split(/\r?\n/).filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(s => s && Number.isFinite(Number(s.balanceSol)))
        .map(s => Number(s.balanceSol));
      snapshots = balances.length;
      if (balances.length) {
        lowest = Math.min(...balances);
        highest = Math.max(...balances);
        current = status && Number.isFinite(Number(status.balanceSol)) ? Number(status.balanceSol) : balances[balances.length - 1];
        delta = current - balances[0];
      }
    }
  } catch { /* best-effort */ }
  if (current === null && status && Number.isFinite(Number(status.balanceSol))) current = Number(status.balanceSol);

  const addr = status && status.walletAddress ? status.walletAddress : null;
  const rpc = rpcVisibilityContext();
  const card = (label, value, cls = "") =>
    `<div class="wc-card"><div class="wc-label">${escapeHtml(label)}</div><div class="wc-value ${cls}">${escapeHtml(String(value ?? "—"))}</div></div>`;

  return `
  <section class="panel wc-panel">
    <div class="wc-title-row">
      <h2 class="wc-heading">◉ WALLET CONNECTION STATUS</h2>
      <div class="wc-health-badge ${health.cls}">${health.label}</div>
    </div>
    <div class="wc-subtitle">Read-only monitor (wallet_monitor.js). Balance queried via RPC every 30s. No signer, no transactions. RPC source reflects env vars visible to this dashboard process.</div>
    ${rpc.warningsHtml}
    ${!status ? `<div class="wc-stale">No wallet_status.json yet — start the monitor: <code>node wallet_monitor.js</code></div>` : ""}
    ${statusError ? `<div class="wc-stale">Error reading wallet_status.json: ${escapeHtml(statusError)}</div>` : ""}
    ${staleNote}

    <div class="wc-cards">
      ${card("RPC Source (wallet monitor)", rpc.walletMonitor.displayLabel, rpcSourceValueCls(rpc.walletMonitor))}
      ${card("RPC Source (pipeline simulation)", rpc.pipelineSimulation.displayLabel, rpcSourceValueCls(rpc.pipelineSimulation))}
      ${card("Wallet Address", addr ? addr.slice(0, 8) + "…" + addr.slice(-6) : "—")}
      ${card("Current SOL Balance", status && status.balanceSol != null ? status.balanceSol.toFixed(4) + " SOL" : (status && !status.connected ? "unavailable" : "—"),
        status && status.connected ? "wc-pos" : "")}
      ${card("Connection Status", status ? (status.connected ? "CONNECTED" : "DISCONNECTED") : "—",
        status && status.connected ? "wc-pos" : "wc-neg")}
      ${card("RPC Latency", status && status.latencyMs != null ? status.latencyMs + " ms" : "—",
        status && status.connected ? (Number(status.latencyMs) < 500 ? "wc-pos" : "wc-warn") : "")}
      ${card("Last Update", status && status.updatedAt ? new Date(status.updatedAt).toLocaleString() : "—")}
      ${card("Health", health.label, health.cls.replace("wc-", "wc-text-"))}
    </div>

    <h2 class="table-heading" style="margin-top:16px">Balance History</h2>
    <div class="wc-subtitle">Snapshots appended to wallet_history.jsonl every 30 minutes. ${snapshots} snapshot(s) recorded.</div>
    <div class="wc-cards">
      ${card("Lowest Observed", lowest != null ? lowest.toFixed(4) + " SOL" : "—")}
      ${card("Highest Observed", highest != null ? highest.toFixed(4) + " SOL" : "—")}
      ${card("Current", current != null ? current.toFixed(4) + " SOL" : "—")}
      ${card("Delta (since first)", delta != null ? (delta >= 0 ? "+" : "") + delta.toFixed(4) + " SOL" : "—",
        delta != null ? (delta > 0 ? "wc-pos" : delta < 0 ? "wc-neg" : "") : "")}
    </div>
  </section>
  `;
}

// ─── RPC Health Panel ─────────────────────────────────────────────────────────

function rpcHealthPanel() {
  let h = null, err = null;
  try { if (fs.existsSync(RPC_HEALTH_FILE)) h = JSON.parse(fs.readFileSync(RPC_HEALTH_FILE, "utf8")); }
  catch (e) { err = e.message; }

  const rpc = rpcVisibilityContext();
  const card = (label, value, cls = "") =>
    `<div class="wc-card"><div class="wc-label">${escapeHtml(label)}</div><div class="wc-value ${cls}">${escapeHtml(String(value ?? "—"))}</div></div>`;

  const failRate = h && h.pings ? (h.failures / h.pings) * 100 : null;

  return `
  <section class="panel wc-panel">
    <h2 class="wc-heading">⚡ RPC HEALTH</h2>
    <div class="wc-subtitle">Connection quality for the wallet monitor's RPC endpoint. Read metrics only. RPC source reflects env vars visible to this dashboard process.</div>
    ${rpc.warningsHtml}
    ${!h ? `<div class="wc-stale">No rpc_health.json yet — start the monitor: <code>node wallet_monitor.js</code></div>` : ""}
    ${err ? `<div class="wc-stale">Error reading rpc_health.json: ${escapeHtml(err)}</div>` : ""}
    <div class="wc-cards">
      ${card("RPC Source (wallet monitor)", rpc.walletMonitor.displayLabel, rpcSourceValueCls(rpc.walletMonitor))}
      ${card("RPC Source (pipeline simulation)", rpc.pipelineSimulation.displayLabel, rpcSourceValueCls(rpc.pipelineSimulation))}
      ${card("Average Latency", h && h.avgLatencyMs != null ? h.avgLatencyMs + " ms" : "—",
        h && h.avgLatencyMs != null ? (h.avgLatencyMs < 500 ? "wc-pos" : "wc-warn") : "")}
      ${card("Worst Latency", h && h.worstLatencyMs != null ? h.worstLatencyMs + " ms" : "—",
        h && h.worstLatencyMs != null && h.worstLatencyMs >= 1000 ? "wc-neg" : "")}
      ${card("Best Latency", h && h.bestLatencyMs != null ? h.bestLatencyMs + " ms" : "—", "wc-pos")}
      ${card("Total Pings", h ? h.pings : "—")}
      ${card("Connection Failures", h ? h.failures : "—", h && h.failures > 0 ? "wc-neg" : "wc-pos")}
      ${card("Failure Rate", failRate != null ? failRate.toFixed(1) + "%" : "—", failRate != null && failRate > 5 ? "wc-neg" : "")}
      ${card("Last Successful Ping", h && h.lastSuccessfulPing ? new Date(h.lastSuccessfulPing).toLocaleString() : "—")}
      ${card("Last Failure", h && h.lastFailureAt ? new Date(h.lastFailureAt).toLocaleString() : "None", h && h.lastFailureAt ? "wc-neg" : "wc-pos")}
    </div>
  </section>
  `;
}

// ─── Live Automation Control Panel (START / STOP / EMERGENCY) ─────────────────

function liveAutomationControlPanel() {
  let stats = null, cfg = null;
  try { if (liveExecutor) stats = liveExecutor.liveStats(); } catch { /* */ }
  try { if (fs.existsSync(CONFIG_FILE)) cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { /* */ }

  const automationOn = cfg && cfg.automationEnabled;
  const emergency = cfg && cfg.emergencyStop;
  const executionMode = liveExecutor && cfg ? liveExecutor.resolveExecutionMode(cfg) : (cfg?.dryRunMode === false ? "LIVE" : "DRY_RUN");
  const dryRun = executionMode !== "LIVE";
  const modeLabel = executionMode.replaceAll("_", " ");

  // Live wallet balance (best-effort, may be null in dashboard context)
  const walletAddr = cfg && cfg.walletPublicAddress ? cfg.walletPublicAddress : null;

  const daily = stats ? {
    pnl: stats.realizedPnlSolToday,
    losses: stats.lossesToday,
    maxLossSol: cfg ? cfg.maxDailyLossSol : 0.10,
    maxLossCount: cfg ? cfg.maxDailyLossCount : 3
  } : null;
  const remainingRiskSol = daily ? Math.max(0, daily.maxLossSol - Math.abs(Math.min(0, daily.pnl))) : null;

  // Status badge
  const status = emergency
    ? { text: "EMERGENCY STOPPED", cls: "ac-emergency" }
    : automationOn
    ? { text: `RUNNING — ${modeLabel}`, cls: dryRun ? "ac-dryrun" : "ac-live" }
    : { text: "STOPPED", cls: "ac-stopped" };

  const readiness = (() => {
    try { return liveExecutor ? liveExecutor.readinessChecks(cfg) : null; } catch { return null; }
  })();
  const armed = (() => {
    try { return liveExecutor && cfg ? liveExecutor.computeLiveArmedStatus(cfg) : null; } catch { return null; }
  })();
  const startDisabled = emergency || (readiness && !readiness.allPassed);

  const row = (label, value, cls = "") =>
    `<div class="ac-stat"><span>${escapeHtml(label)}</span><strong class="${cls}">${escapeHtml(String(value ?? "—"))}</strong></div>`;

  const readinessRows = readiness
    ? readiness.checks.map(c =>
        `<li class="${c.ok ? "ac-ok" : "ac-fail"}">${c.ok ? "✔" : "✘"} ${escapeHtml(c.label)}${c.detail ? ` <span>${escapeHtml(c.detail)}</span>` : ""}</li>`
      ).join("")
    : `<li class="ac-fail">✘ executor not loaded</li>`;

  const liveGateRows = armed
    ? Object.values(armed.gates).map(g =>
        `<li class="${g.ok ? "ac-ok" : "ac-fail"}">${g.ok ? "✔" : "✘"} ${escapeHtml(g.label)} <span>${escapeHtml(g.detail)}</span></li>`
      ).join("")
    : `<li class="ac-fail">✘ live arming status unavailable</li>`;

  const armedStrip = armed
    ? `<div class="ac-live-armed-strip ${armed.liveArmed ? "ac-live-armed-yes" : "ac-live-armed-no"}">
        <strong>LIVE ARMED: ${armed.liveArmed ? "YES" : "NO"}</strong>
        · Posture: ${escapeHtml(armed.operationalPosture)}
        · ${escapeHtml(armed.summary)}
      </div>
      ${!armed.liveArmed ? `<div class="ac-hint">Readiness ALL PASS and automation RUNNING do not mean live armed — pipeline observation may still run without on-chain submission.</div>` : ""}
      ${!armed.liveArmed && armed.failures.length ? `<div class="ac-hint">Blocking: ${escapeHtml(armed.failures.join("; "))}</div>` : ""}`
    : `<div class="ac-hint">Live arming status unavailable — executor not loaded.</div>`;

  return `
  <section class="panel ac-panel">
    <div class="ac-title-row">
      <h2 class="ac-heading">⬢ LIVE AUTOMATION CONTROL</h2>
      <div class="ac-status-badge ${status.cls}">${status.text}</div>
    </div>
    ${armedStrip}
    ${dryRun ? `<div class="ac-dryrun-banner">🧪 ${modeLabel} MODE — ${executionMode === "PIPELINE_DRY_RUN" ? "the full unsigned pipeline runs, but NOTHING is signed or submitted." : "transaction intents are generated and logged, but NOTHING is submitted on-chain."}</div>` : `<div class="ac-live-banner">⚠ LIVE MODE — real execution remains blocked until Step 9.</div>`}
    ${emergency ? `<div class="ac-emergency-banner">⛔ EMERGENCY STOP ACTIVE — all entries and exits halted. Run <code>node reset_live_safety.js</code> to clear (does not re-enable automation).</div>` : ""}

    <div class="ac-buttons">
      <form method="POST" action="/control/start" class="ac-form">
        <button type="submit" class="ac-btn ac-btn-start" ${startDisabled ? "disabled" : ""}>▶ START</button>
      </form>
      <form method="POST" action="/control/stop" class="ac-form">
        <button type="submit" class="ac-btn ac-btn-stop">⏸ STOP</button>
      </form>
      <form method="POST" action="/control/emergency" class="ac-form">
        <button type="submit" class="ac-btn ac-btn-emergency">⛔ EMERGENCY STOP</button>
      </form>
    </div>
    ${startDisabled && !emergency ? `<div class="ac-hint">START is disabled until all readiness checks pass (see below).</div>` : ""}
    <div class="ac-hint">START enables entries (respecting dry run). STOP halts new entries but lets open positions exit. EMERGENCY halts everything and requires a reset.</div>

    <div class="ac-grid">
      ${row("Automation Status", status.text, status.cls.replace("ac-", "ac-text-"))}
      ${row("Execution Mode", modeLabel, dryRun ? "ac-text-dryrun" : "ac-text-live")}
      ${row("Wallet Address", walletAddr ? walletAddr.slice(0, 6) + "…" + walletAddr.slice(-4) : "Not set", walletAddr ? "" : "ac-fail")}
      ${row("Wallet Balance", "Read on executor start", "")}
      ${row("Open Live Positions", stats ? stats.openTrades : "—")}
      ${row("Daily Realized PnL", daily ? daily.pnl.toFixed(4) + " SOL" : "—", daily && daily.pnl < 0 ? "ac-fail" : daily && daily.pnl > 0 ? "ac-ok" : "")}
      ${row("Daily Loss Count", daily ? `${daily.losses} / ${daily.maxLossCount}` : "—", daily && daily.losses >= daily.maxLossCount ? "ac-fail" : "")}
      ${row("Remaining Daily Risk", remainingRiskSol !== null ? remainingRiskSol.toFixed(4) + " SOL" : "—", remainingRiskSol === 0 ? "ac-fail" : "")}
      ${row("Last Action", cfg && cfg.lastAutomationToggleReason ? cfg.lastAutomationToggleReason : "—")}
      ${row("Last Action At", cfg && cfg.lastAutomationToggleAt ? new Date(cfg.lastAutomationToggleAt).toLocaleString() : "—")}
      ${row("Last Error", cfg && cfg.lastError ? cfg.lastError : "None", cfg && cfg.lastError ? "ac-fail" : "ac-ok")}
    </div>

    <h2 class="table-heading" style="margin-top:18px">Live Submission Gates</h2>
    <ul class="ac-readiness ac-live-gates">${liveGateRows}</ul>

    <h2 class="table-heading" style="margin-top:18px">Start Readiness Checks</h2>
    <ul class="ac-readiness">${readinessRows}</ul>
  </section>
  `;
}

// ─── Live vs Paper Comparison Panel ───────────────────────────────────────────

function liveVsPaperPanel() {
  let stats = null;
  try { if (liveExecutor) stats = liveExecutor.liveStats(); } catch { /* */ }
  if (!stats) {
    return `<section class="panel"><h2>Live vs Paper Comparison</h2><div class="subtitle">Executor not loaded.</div></section>`;
  }

  const cmp = (label, live, paper, cls = "") => `
    <tr><td>${escapeHtml(label)}</td><td class="${cls}">${escapeHtml(String(live ?? "—"))}</td><td>${escapeHtml(String(paper ?? "—"))}</td></tr>`;

  return `
  <section class="panel">
    <h2>Live vs Paper Comparison</h2>
    <div class="subtitle">Live execution quality vs the paper baseline over closed gmgn_v4 trades. Dry-run trades count as live for structure validation.</div>
    <table>
      <thead><tr><th>Metric</th><th>Live</th><th>Paper</th></tr></thead>
      <tbody>
        ${cmp("Trades Count", stats.totalLiveTrades, stats.paperTradesCount)}
        ${cmp("Win / Loss / Timeout", `${stats.wins} / ${stats.losses} / ${stats.timeouts}`, "—")}
        ${cmp("Avg PnL %", stats.liveAvgPnlPct !== null ? stats.liveAvgPnlPct + "%" : "—", stats.paperAvgPnlPct !== null ? stats.paperAvgPnlPct + "%" : "—")}
        ${cmp("Net PnL (SOL)", stats.totalNetPnlSol.toFixed(4), "—", stats.totalNetPnlSol < 0 ? "negative" : "positive")}
        ${cmp("Profit Factor", stats.profitFactor ?? "—", "—")}
        ${cmp("Max Drawdown (SOL)", stats.maxDrawdownSol.toFixed(4), "—")}
        ${cmp("Avg Entry Slippage", stats.avgEntrySlippagePct + "%", "0% (paper)")}
        ${cmp("Avg Exit Slippage", stats.avgExitSlippagePct + "%", "0% (paper)")}
        ${cmp("Total Fees (SOL)", stats.totalFeesSol.toFixed(4), "0 (paper)")}
        ${cmp("Avg Exit Latency", stats.avgExitLatencyMs + " ms", "n/a (paper)")}
        ${cmp("Edge Preservation Score", stats.edgePreservationScore !== null ? stats.edgePreservationScore + " / 100" : "— (need closed live trades)", "100 (baseline)",
          stats.edgePreservationScore !== null && stats.edgePreservationScore < 70 ? "negative" : stats.edgePreservationScore >= 90 ? "positive" : "")}
        ${cmp("Current Live Status", stats.config.emergencyStop ? "EMERGENCY" : stats.config.automationEnabled ? (stats.config.dryRunMode ? "RUNNING (dry run)" : "RUNNING (live)") : "STOPPED", "—")}
      </tbody>
    </table>
    <div class="subtitle" style="margin-top:10px">Edge preservation = live avg PnL ÷ paper avg PnL × 100. 100 means live matches paper; below 70 means live is materially underperforming and execution should pause.</div>
  </section>
  `;
}

// ─── Live Execution Dashboard Panel ───────────────────────────────────────────

function liveExecutionPanel() {
  // Pull stats from live_executor without ever triggering trades.
  let stats = null;
  let statsError = null;
  try {
    if (liveExecutor) {
      stats = liveExecutor.liveStats();
    }
  } catch (err) {
    statsError = err.message;
  }

  // Wallet balance — read-only from config.
  let cfg = null;
  try {
    if (fs.existsSync(CONFIG_FILE)) cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch { /* ignore */ }

  const walletAddr = cfg && cfg.walletPublicAddress ? cfg.walletPublicAddress : null;
  const automationEnabled = cfg && cfg.automationEnabled === true;
  const dryRunMode = cfg && cfg.dryRunMode === true;
  const emergencyStop = cfg && cfg.emergencyStop === true;
  const dailyStopActive = stats && stats.dailyStopActive;

  // Status badge
  const statusLabel = !liveExecutor
    ? { text: "EXECUTOR NOT LOADED", cls: "le-status-warn" }
    : statsError
    ? { text: "STATS ERROR", cls: "le-status-warn" }
    : emergencyStop
    ? { text: "EMERGENCY STOPPED", cls: "le-status-stop" }
    : dailyStopActive
    ? { text: "DAILY STOP ACTIVE", cls: "le-status-stop" }
    : automationEnabled && dryRunMode
    ? { text: "RUNNING — DRY RUN", cls: "le-status-live" }
    : dryRunMode
    ? { text: "STOPPED — DRY RUN", cls: "le-status-standby" }
    : { text: "BLOCKED — DRY RUN OFF", cls: "le-status-stop" };

  // Stat card helper
  const leCard = (label, value, cls = "") =>
    `<div class="le-card"><div class="le-label">${escapeHtml(label)}</div><div class="le-value ${cls}">${escapeHtml(String(value ?? "—"))}</div></div>`;

  // Edge preservation color
  const edgeClass = (score) => {
    if (score === null || score === undefined) return "";
    if (score >= 90) return "le-positive";
    if (score >= 70) return "le-warn";
    return "le-negative";
  };

  // Daily stop rows
  const dsLosses   = stats ? stats.lossesToday : 0;
  const dsLossMax  = cfg ? (cfg.maxDailyLossCount || 3) : 3;
  const dsSolLoss  = stats ? stats.realizedPnlSolToday : 0;
  const dsSolMax   = cfg ? (cfg.maxDailyLossSol || 0.10) : 0.10;
  const dsBarLoss  = Math.min(100, (dsLosses / dsLossMax) * 100);
  const dsBarSol   = Math.min(100, (Math.abs(Math.min(0, dsSolLoss)) / dsSolMax) * 100);

  // Slippage vs paper divergence warning
  let slippageWarn = "";
  if (stats && stats.avgSlippagePct > 3) {
    slippageWarn = `<div class="le-warning-banner">⚠ Average slippage ${stats.avgSlippagePct.toFixed(2)}% exceeds 3% threshold — review execution quality.</div>`;
  }
  if (stats && stats.maxSlippagePct > 10) {
    slippageWarn += `<div class="le-warning-banner">⚠ Max slippage ${stats.maxSlippagePct.toFixed(2)}% detected — check for thin liquidity or MEV on exit.</div>`;
  }

  // Edge preservation warning
  let edgeWarn = "";
  if (stats && stats.edgePreservationScore !== null && stats.edgePreservationScore < 70) {
    edgeWarn = `<div class="le-warning-banner">⚠ Edge preservation score ${stats.edgePreservationScore} is below 70 — live execution is significantly underperforming paper trades. Pause and investigate.</div>`;
  }

  // Recent live trades table
  let recentTradesHtml = `<tr><td colspan="9" class="empty">No closed live trades yet.</td></tr>`;
  if (liveExecutor) {
    try {
      const trades = liveExecutor.groupLiveTrades();
      const closedSorted = trades
        .filter(t => ["WIN", "LOSS", "TIMEOUT", "CLOSED"].includes(t.status))
        .sort((a, b) => new Date(b.exitTime || 0).getTime() - new Date(a.exitTime || 0).getTime())
        .slice(0, 10);

      if (closedSorted.length) {
        recentTradesHtml = closedSorted.map(t => {
          const netPnl = Number(t.netPnlSol || 0);
          const pnlCls = netPnl > 0 ? "le-positive" : netPnl < 0 ? "le-negative" : "";
          const flags = (t.anomalyFlags || []).filter(f => f !== "DRY_RUN");
          const dryRun = (t.anomalyFlags || []).includes("DRY_RUN");
          return `<tr>
            <td>${escapeHtml(t.symbol || "—")}${dryRun ? ' <span class="le-dryrun-badge">DRY</span>' : ""}</td>
            <td><span class="status ${String(t.status).toLowerCase()}">${escapeHtml(t.status)}</span></td>
            <td>${t.positionSizeSol != null ? Number(t.positionSizeSol).toFixed(2) : "—"} SOL</td>
            <td>${t.actualEntryPrice != null ? "$" + Number(t.actualEntryPrice).toFixed(8) : "—"}</td>
            <td>${t.actualExitPrice != null ? "$" + Number(t.actualExitPrice).toFixed(8) : "—"}</td>
            <td class="${pnlCls}">${Number.isFinite(netPnl) ? netPnl.toFixed(4) + " SOL" : "—"}</td>
            <td>${t.totalFeesSol != null ? Number(t.totalFeesSol).toFixed(4) + " SOL" : "—"}</td>
            <td>${t.exitSlippagePct != null ? Number(t.exitSlippagePct).toFixed(2) + "%" : "—"}</td>
            <td class="${flags.length ? "le-warn" : ""}">${flags.length ? flags.map(f => escapeHtml(f)).join(", ") : "—"}</td>
          </tr>`;
        }).join("");
      }
    } catch { /* table render is best-effort */ }
  }

  // Parse error warning
  const parseErrWarn = stats && stats.parseErrors > 0
    ? `<div class="le-warning-banner">⚠ ${stats.parseErrors} unparseable line(s) in live_trades.jsonl — file may be partially corrupt. Run node reset_live_safety.js --reset-live-trades to inspect.</div>`
    : "";

  return `
  <section class="panel le-panel">
    <div class="le-title-row">
      <h2 class="le-heading">◈ LIVE EXECUTION DASHBOARD</h2>
      <div class="le-status-badge ${statusLabel.cls}">${statusLabel.text}</div>
    </div>
    <div class="le-subtitle">
      Phase 1 micro-test · ${cfg ? cfg.positionSizeSol : "0.10"} SOL per trade · max 1 concurrent position ·
      daily stop: ${dsLossMax} losses or −${dsSolMax} SOL · no compounding · no averaging · no martingale
    </div>

    ${parseErrWarn}${slippageWarn}${edgeWarn}

    ${!liveExecutor ? `<div class="le-warning-banner">live_executor.js not loaded — place it in the project root and restart the dashboard.</div>` : ""}
    ${statsError ? `<div class="le-warning-banner">Stats error: ${escapeHtml(statsError)}</div>` : ""}

    <div class="le-cards">
      ${leCard("Open Trades", stats ? stats.openTrades : "—")}
      ${leCard("Total Live Trades", stats ? stats.totalLiveTrades : "—")}
      ${leCard("Wins / Losses / Timeouts",
        stats ? `${stats.wins} / ${stats.losses} / ${stats.timeouts}` : "— / — / —")}
      ${leCard("Win Rate", stats && stats.winRate !== null ? stats.winRate + "%" : "—",
        stats && Number(stats.winRate) >= 50 ? "le-positive" : "le-negative")}
      ${leCard("Net PnL (SOL)", stats ? stats.totalNetPnlSol.toFixed(4) + " SOL" : "—",
        stats && stats.totalNetPnlSol > 0 ? "le-positive" : stats && stats.totalNetPnlSol < 0 ? "le-negative" : "")}
      ${leCard("Avg PnL / Trade", stats ? stats.avgPnlSol.toFixed(4) + " SOL" : "—",
        stats && stats.avgPnlSol > 0 ? "le-positive" : stats && stats.avgPnlSol < 0 ? "le-negative" : "")}
      ${leCard("Profit Factor",
        stats && stats.profitFactor !== null ? stats.profitFactor : "—",
        stats && stats.profitFactor !== null && stats.profitFactor >= 1 ? "le-positive" : "le-negative")}
      ${leCard("Max Drawdown",
        stats ? stats.maxDrawdownSol.toFixed(4) + " SOL (" + stats.maxDrawdownPct.toFixed(1) + "%)" : "—",
        stats && stats.maxDrawdownPct > 10 ? "le-negative" : "")}
      ${leCard("Avg Slippage", stats ? stats.avgSlippagePct.toFixed(2) + "%" : "—",
        stats && stats.avgSlippagePct > 3 ? "le-warn" : "")}
      ${leCard("Max Slippage", stats ? stats.maxSlippagePct.toFixed(2) + "%" : "—",
        stats && stats.maxSlippagePct > 5 ? "le-negative" : "")}
      ${leCard("Edge Preservation",
        stats && stats.edgePreservationScore !== null ? stats.edgePreservationScore + " / 100" : "—",
        edgeClass(stats && stats.edgePreservationScore))}
      ${leCard("Wallet",
        walletAddr
          ? walletAddr.slice(0, 6) + "…" + walletAddr.slice(-4)
          : "Not connected",
        walletAddr ? "" : "le-warn")}
    </div>

    <div class="le-daily-stop-row">
      <div class="le-ds-block">
        <div class="le-ds-label">Daily Losses&nbsp;<span class="${dailyStopActive ? "le-negative" : ""}">${dsLosses} / ${dsLossMax}</span></div>
        <div class="le-ds-bar-track"><div class="le-ds-bar ${dsLosses >= dsLossMax ? "le-ds-bar-hit" : ""}" style="width:${dsBarLoss}%"></div></div>
      </div>
      <div class="le-ds-block">
        <div class="le-ds-label">Daily SOL Loss&nbsp;<span class="${dailyStopActive ? "le-negative" : ""}">${Math.abs(Math.min(0, dsSolLoss)).toFixed(4)} / ${dsSolMax} SOL</span></div>
        <div class="le-ds-bar-track"><div class="le-ds-bar ${Math.abs(Math.min(0, dsSolLoss)) >= dsSolMax ? "le-ds-bar-hit" : ""}" style="width:${dsBarSol}%"></div></div>
      </div>
      <div class="le-ds-status ${dailyStopActive ? "le-ds-stopped" : "le-ds-ok"}">
        ${dailyStopActive ? "⛔ DAILY STOP ACTIVE" : "✓ DAILY STOP OK"}
      </div>
    </div>

    <h2 class="table-heading" style="margin-top:20px">Recent Live Trades (last 10)</h2>
    <div class="le-note">Anomaly flags: HIGH_ENTRY_SLIPPAGE / HIGH_EXIT_SLIPPAGE = fill deviated &gt;5% · LARGE_PAPER_LIVE_DIVERGENCE = live PnL deviated &gt;10% from paper · DRY_RUN = no transaction submitted (shown as badge)</div>
    <div class="token-table-wrap">
      <table>
        <thead><tr>
          <th>Symbol</th><th>Status</th><th>Size</th>
          <th>Entry Price</th><th>Exit Price</th><th>Net PnL</th>
          <th>Fees</th><th>Exit Slippage</th><th>Anomaly Flags</th>
        </tr></thead>
        <tbody>${recentTradesHtml}</tbody>
      </table>
    </div>

    <div class="le-footer-note">
      Automation: <strong>${automationEnabled ? "RUNNING" : "STOPPED"}</strong> ·
      Dry-run mode: <strong>${dryRunMode ? "ENABLED" : "DISABLED"}</strong> ·
      Real trading: <strong>${dryRunMode ? "DISABLED" : "BLOCKED"}</strong> ·
      Wallet address read from live_config.json ·
      All trades logged to live_trades.jsonl ·
      Kill switch: <code>node emergency_stop.js</code>
    </div>
  </section>
  `;
}

// ─── End Live Execution Dashboard Panel ───────────────────────────────────────

// ─── Phase 1 Live Readiness Panel ─────────────────────────────────────────────

function readLiveConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return null; }
}

function liveTradesStatus() {
  const exists = fs.existsSync(LIVE_TRADES_FILE);
  if (!exists) return { exists: false, empty: false, valid: false, eventCount: 0, parseErrors: 0 };
  const raw = fs.readFileSync(LIVE_TRADES_FILE, "utf8").trim();
  if (raw === "") return { exists: true, empty: true, valid: true, eventCount: 0, parseErrors: 0 };
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let parseErrors = 0;
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { parseErrors += 1; }
  }
  return { exists: true, empty: false, valid: parseErrors === 0, eventCount: events.length, parseErrors };
}

function legacyPhase1ReadinessPanel(forwardTrades) {
  const cfg = readLiveConfig();
  const ltStatus = liveTradesStatus();

  // ── Config checks ──────────────────────────────────────────────────────────
  const cfgOk = cfg !== null;
  const liveDisabled = cfgOk && cfg.liveTradingEnabled === false;
  const manualConfirm = cfgOk && cfg.requireManualConfirm === true;
  const positionSize = cfgOk ? cfg.positionSizeSol : null;
  const maxOpen = cfgOk ? cfg.maxOpenTrades : null;
  const maxDailyLoss = cfgOk ? cfg.maxDailyLossSol : null;
  const maxDrawdown = cfgOk ? cfg.maxDrawdownPercent : null;

  // ── Safety checks ─────────────────────────────────────────────────────────
  const emergencyStopActive = cfgOk && Boolean(cfg.emergencyStopActivatedAt);
  const emergencyStopAvailable = fs.existsSync(EMERGENCY_STOP_FILE);
  const liveLoggerAvailable = fs.existsSync(LIVE_LOGGER_FILE);
  const dailyStopLogicAvailable = liveLoggerAvailable; // safetyStatus() enforces maxDailyLossSol
  const drawdownStopAvailable = liveLoggerAvailable;   // safetyStatus() enforces maxDrawdownPercent

  // ── Research stats ────────────────────────────────────────────────────────
  const ANOMALY_SYMBOLS = ["MBAPPE"];
  const closed = forwardTrades.filter(t =>
    CLOSED_STATUSES.has(t.status) && Number.isFinite(Number(t.pnlPercent))
  );
  const cleanClosed = closed.filter(t => !ANOMALY_SYMBOLS.includes((t.symbol || "").toUpperCase()));
  const uniqueTokens = new Set(forwardTrades.map(t => t.address).filter(Boolean)).size;
  const rawPnl = closed.reduce((s, t) => s + Number(t.pnlPercent), 0);
  const adjPnl = cleanClosed.reduce((s, t) => s + Number(t.pnlPercent), 0);
  const grossWins = cleanClosed.filter(t => Number(t.pnlPercent) > 0).reduce((s, t) => s + Number(t.pnlPercent), 0);
  const grossLosses = Math.abs(cleanClosed.filter(t => Number(t.pnlPercent) < 0).reduce((s, t) => s + Number(t.pnlPercent), 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : null;
  const anomalyTrades = closed.filter(t => ANOMALY_SYMBOLS.includes((t.symbol || "").toUpperCase()));
  const blackSwanComplete = anomalyTrades.length > 0;

  // ── Dashboard panel self-check ────────────────────────────────────────────
  const dashboardOperational = true; // if this renders, dashboard is live

  // ── READY FOR MICRO TEST gate ─────────────────────────────────────────────
  const walletConnected = false; // placeholder — no wallet connected yet
  const currentAnomalies = 0;   // anomaly count from NEEDS_REVIEW open trades

  const microTestConditions = [
    liveDisabled,
    manualConfirm,
    emergencyStopAvailable,
    ltStatus.valid,
    walletConnected,
    dashboardOperational,
    currentAnomalies === 0,
    blackSwanComplete
  ];
  const microTestPassed = microTestConditions.every(Boolean);
  const partiallyReady = !microTestPassed && [liveDisabled, manualConfirm, emergencyStopAvailable, ltStatus.valid, dashboardOperational].every(Boolean);

  const executionStatus = microTestPassed
    ? { label: "READY FOR MICRO TEST", cls: "phase1-ready" }
    : partiallyReady
    ? { label: "PARTIALLY READY", cls: "phase1-partial" }
    : { label: "NOT READY", cls: "phase1-notready" };

  // ── Render helpers ────────────────────────────────────────────────────────
  const row = (label, value, ok, detail = "") => {
    const dot = ok ? `<span class="p1dot p1dot-ok"></span>` : `<span class="p1dot p1dot-fail"></span>`;
    const valCls = ok ? "p1ok" : "p1fail";
    return `<tr>
      <td class="p1label">${dot}${escapeHtml(label)}</td>
      <td class="p1value ${valCls}">${escapeHtml(String(value))}</td>
      ${detail ? `<td class="p1detail">${escapeHtml(detail)}</td>` : `<td class="p1detail"></td>`}
    </tr>`;
  };

  const rowWarn = (label, value, detail = "") => `<tr>
    <td class="p1label"><span class="p1dot p1dot-warn"></span>${escapeHtml(label)}</td>
    <td class="p1value p1warn">${escapeHtml(String(value))}</td>
    <td class="p1detail">${escapeHtml(detail)}</td>
  </tr>`;

  const subhead = (title) => `<tr class="p1subhead"><td colspan="3">${escapeHtml(title)}</td></tr>`;

  const pf = profitFactor !== null ? profitFactor.toFixed(2) : "N/A (no losses)";

  return `
  <section class="panel p1-panel">
    <div class="p1-title-row">
      <h2 class="p1-heading">⬡ PHASE 1 LIVE READINESS</h2>
      <div class="p1-version-badge">gmgn_v4 / monitor_v4</div>
    </div>
    <div class="p1-subtitle">Pre-execution checklist for $200 dedicated wallet validation. Live trading remains disabled until all conditions pass.</div>

    <table class="p1-table">
      <colgroup>
        <col style="width:34%">
        <col style="width:22%">
        <col style="width:44%">
      </colgroup>
      <tbody>

        ${subhead("💳  WALLET")}
        ${row("Wallet Address", "Not connected", false, "Set wallet address in live_config.json")}
        ${row("Wallet Balance", "—", false, "Connect wallet to read balance")}
        ${row("Connected / Disconnected", "DISCONNECTED", false, "Required before Phase 1 can begin")}

        ${subhead("⚙️  CONFIGURATION")}
        ${row("liveTradingEnabled", cfgOk ? String(cfg.liveTradingEnabled) : "FILE MISSING", liveDisabled)}
        ${row("requireManualConfirm", cfgOk ? String(cfg.requireManualConfirm) : "FILE MISSING", manualConfirm)}
        ${positionSize !== null && positionSize > 0.10 ? rowWarn("positionSizeSol", positionSize, "Phase 1 target is 0.10 SOL") : row("positionSizeSol", positionSize ?? "—", positionSize !== null, "Target: 0.10 SOL for Phase 1")}
        ${row("maxOpenTrades", maxOpen ?? "—", maxOpen !== null && maxOpen >= 1)}
        ${row("maxDailyLossSol", maxDailyLoss !== null ? `${maxDailyLoss} SOL` : "—", maxDailyLoss !== null && maxDailyLoss > 0)}
        ${row("maxDrawdownPercent", maxDrawdown !== null ? `${maxDrawdown}%` : "—", maxDrawdown !== null && maxDrawdown > 0)}

        ${subhead("🛡️  SAFETY")}
        ${emergencyStopActive
          ? rowWarn("Emergency stop active?", "YES — STOP ACTIVE", "Run node reset_live_safety.js to clear")
          : row("Emergency stop active?", "No — cleared", true, "Safe standby state")}
        ${row("Kill switch available?", emergencyStopAvailable ? "YES — emergency_stop.js present" : "NO — FILE MISSING", emergencyStopAvailable)}
        ${row("Daily stop logic available?", dailyStopLogicAvailable ? "YES — live_trade_logger.js" : "NO — FILE MISSING", dailyStopLogicAvailable)}
        ${row("Drawdown stop available?", drawdownStopAvailable ? "YES — live_trade_logger.js" : "NO — FILE MISSING", drawdownStopAvailable)}

        ${subhead("📁  FILES")}
        ${row("live_trades.jsonl exists", ltStatus.exists ? "YES" : "NO", ltStatus.exists)}
        ${ltStatus.empty
          ? row("live_trades.jsonl empty and valid JSONL", "EMPTY — ready", true, "No prior live events")
          : ltStatus.valid
            ? rowWarn("live_trades.jsonl empty and valid JSONL", `${ltStatus.eventCount} event(s) present`, "Has prior events — not empty but JSONL is valid")
            : row("live_trades.jsonl empty and valid JSONL", `INVALID — ${ltStatus.parseErrors} parse error(s)`, false, "Run: node reset_live_safety.js --reset-live-trades")}
        ${row("Live logger operational", liveLoggerAvailable ? "YES — live_trade_logger.js present" : "NO — FILE MISSING", liveLoggerAvailable)}
        ${row("Dashboard live panel operational", "YES — rendering now", true)}

        ${subhead("📊  RESEARCH STATUS")}
        ${row("Clean forward trades (gmgn_v4)", cleanClosed.length, cleanClosed.length >= 20, cleanClosed.length < 20 ? `${20 - cleanClosed.length} more needed for Phase 1 confidence` : "Sufficient for Phase 1")}
        ${row("Unique tokens", uniqueTokens, uniqueTokens >= 15)}
        ${row("Raw PnL (all closed)", formatPercent(rawPnl), rawPnl > 0)}
        ${row("Adjusted PnL (ex-anomalies)", formatPercent(adjPnl), adjPnl > 0, "Excludes MBAPPE data error")}
        ${row("Profit factor (ex-anomalies)", pf, profitFactor !== null && profitFactor > 1.0)}
        ${blackSwanComplete
          ? rowWarn("Black Swan status", `${anomalyTrades.length} anomaly trade(s) classified`, "MBAPPE -99% classified as data/execution anomaly — excluded from adjusted PnL")
          : row("Black Swan status", "No anomalies detected", true, "No NEEDS_REVIEW trades in sample")}

      </tbody>
    </table>

    <div class="p1-execution-row">
      <div class="p1-execution-label">EXECUTION STATUS</div>
      <div class="p1-execution-badge ${executionStatus.cls}">${executionStatus.label}</div>
      ${!microTestPassed ? `<div class="p1-execution-detail">${
        !walletConnected ? "Wallet not connected. " : ""
      }${
        emergencyStopActive ? "Emergency stop active — run reset_live_safety.js. " : ""
      }${
        !ltStatus.valid ? "live_trades.jsonl invalid — run reset_live_safety.js --reset-live-trades. " : ""
      }${
        !liveDisabled ? "liveTradingEnabled must remain false. " : ""
      }${
        !manualConfirm ? "requireManualConfirm must be true. " : ""
      }</div>` : ""}
    </div>

    <div class="p1-note">
      ⚠ Live trading is NOT enabled. No wallet is connected. No transactions will be submitted.
      This panel is a pre-execution readiness display only. Use <code>node reset_live_safety.js</code> to clear the emergency stop and validate files.
      Set <code>positionSizeSol: 0.10</code> in live_config.json for Phase 1 micro-test sizing.
    </div>
  </section>
  `;
}

// ─── End Phase 1 Live Readiness Panel ─────────────────────────────────────────

// Current-schema replacement for the legacy readiness panel above.
// This is display-only and reads the same files used by the autonomous dry-run system.
function phase1ReadinessPanel() {
  const requiredConfigFields = [
    "automationEnabled", "dryRunMode", "emergencyStop", "walletPublicAddress",
    "positionSizeSol", "maxOpenTrades", "maxDailyLossSol", "maxDailyLossCount",
    "maxDrawdownPercent", "compoundingEnabled", "averagingDownEnabled", "martingaleEnabled"
  ];
  const requiredFiles = [
    ["live_config.json", CONFIG_FILE],
    ["wallet_status.json", WALLET_STATUS_FILE],
    ["live_executor.js", LIVE_EXECUTOR_FILE],
    ["simulation_results.json", SIMULATION_RESULTS_FILE]
  ];

  let cfg = null;
  let cfgParseError = null;
  let wallet = null;
  let walletParseError = null;
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (err) { cfgParseError = err.message; }
  try { wallet = JSON.parse(fs.readFileSync(WALLET_STATUS_FILE, "utf8")); } catch (err) { walletParseError = err.message; }

  const ledger = readJsonLines(LIVE_TRADES_FILE);
  const missingFiles = requiredFiles.filter(([, file]) => !fs.existsSync(file)).map(([name]) => name);
  const missingConfigFields = cfg ? requiredConfigFields.filter(field => !Object.hasOwn(cfg, field)) : requiredConfigFields;
  const configInvalid = Boolean(cfgParseError) || missingConfigFields.length > 0;
  const walletConnected = wallet?.connected === true;
  const walletMatchesConfig = walletConnected && wallet.walletAddress === cfg?.walletPublicAddress;

  const blockers = [];
  if (configInvalid) blockers.push("config invalid");
  if (walletParseError || (wallet && !walletConnected)) blockers.push("wallet disconnected");
  if (ledger.invalid > 0) blockers.push("live JSONL invalid");
  if (Number(cfg?.maxOpenTrades) > 1) blockers.push("maxOpenTrades exceeds 1");
  if (Number(cfg?.positionSizeSol) > 0.10) blockers.push("positionSizeSol exceeds 0.10");
  if (cfg?.compoundingEnabled === true) blockers.push("compounding enabled");
  if (cfg?.averagingDownEnabled === true) blockers.push("averaging down enabled");
  if (cfg?.martingaleEnabled === true) blockers.push("martingale enabled");
  if (cfg && cfg.dryRunMode !== true) blockers.push("dryRunMode is not true");
  if (walletConnected && !walletMatchesConfig) blockers.push("wallet address mismatch");

  let unifiedStatus;
  let statusClass;
  if (missingFiles.length > 0) {
    unifiedStatus = "NOT READY";
    statusClass = "phase1-notready";
  } else if (cfg?.emergencyStop === true) {
    unifiedStatus = "EMERGENCY STOPPED";
    statusClass = "phase1-notready";
  } else if (blockers.length > 0) {
    unifiedStatus = "BLOCKED";
    statusClass = "phase1-notready";
  } else if (cfg?.automationEnabled === true && cfg?.dryRunMode === true) {
    unifiedStatus = "RUNNING — DRY RUN";
    statusClass = "phase1-ready";
  } else if (cfg?.automationEnabled === false && cfg?.dryRunMode === true && walletConnected) {
    unifiedStatus = "STOPPED — DRY RUN READY";
    statusClass = "phase1-partial";
  } else {
    unifiedStatus = "BLOCKED";
    statusClass = "phase1-notready";
  }

  const row = (label, value, ok, detail = "") => `<tr>
    <td class="p1label"><span class="p1dot ${ok ? "p1dot-ok" : "p1dot-fail"}"></span>${escapeHtml(label)}</td>
    <td class="p1value ${ok ? "p1ok" : "p1fail"}">${escapeHtml(String(value))}</td>
    <td class="p1detail">${escapeHtml(detail)}</td>
  </tr>`;
  const statusCard = (label, value, cls = "") =>
    `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value ${cls}">${escapeHtml(value)}</div></div>`;
  const subhead = title => `<tr class="p1subhead"><td colspan="3">${escapeHtml(title)}</td></tr>`;
  const boolText = value => value === true ? "true" : value === false ? "false" : "missing";

  const armed = (() => {
    try { return liveExecutor && cfg ? liveExecutor.computeLiveArmedStatus(cfg) : null; } catch { return null; }
  })();

  return `
  <section class="panel p1-panel">
    <div class="p1-title-row">
      <h2 class="p1-heading">PHASE 1 AUTONOMOUS DRY-RUN READINESS</h2>
      <div class="p1-execution-badge ${statusClass}">${unifiedStatus}</div>
    </div>
    <div class="p1-subtitle">Unified safety status from the current Phase 1 automation schema. Real trading remains disabled while dry-run mode is active.</div>
    ${armed ? `<div class="ac-live-armed-strip ${armed.liveArmed ? "ac-live-armed-yes" : "ac-live-armed-no"}" style="margin-bottom:12px">
      <strong>LIVE ARMED: ${armed.liveArmed ? "YES" : "NO"}</strong>
      · Posture: ${escapeHtml(armed.operationalPosture)}
      · ${escapeHtml(armed.summary)}
    </div>` : ""}

    <div class="cards">
      ${statusCard("Wallet Status", walletConnected ? "GREEN — CONNECTED" : "RED — DISCONNECTED", walletConnected ? "positive" : "negative")}
      ${statusCard("Automation Status", cfg?.automationEnabled ? "RUNNING" : "STOPPED", cfg?.automationEnabled ? "positive" : "")}
      ${statusCard("Dry-Run Mode", cfg?.dryRunMode ? "ENABLED" : "DISABLED", cfg?.dryRunMode ? "positive" : "negative")}
      ${statusCard("Live Armed", armed ? (armed.liveArmed ? "YES — GATES SATISFIED" : "NO — DISARMED") : "—", armed?.liveArmed ? "negative" : "positive")}
      ${statusCard("Real Trading", cfg?.dryRunMode ? "DISABLED" : "BLOCKED", cfg?.dryRunMode ? "positive" : "negative")}
    </div>

    <table class="p1-table">
      <tbody>
        ${subhead("AUTOMATION SOURCE — live_config.json")}
        ${row("automationEnabled", boolText(cfg?.automationEnabled), typeof cfg?.automationEnabled === "boolean")}
        ${row("dryRunMode", boolText(cfg?.dryRunMode), cfg?.dryRunMode === true, "Must remain true")}
        ${row("emergencyStop", boolText(cfg?.emergencyStop), cfg?.emergencyStop === false)}
        ${row("walletPublicAddress", cfg?.walletPublicAddress || "missing", Boolean(cfg?.walletPublicAddress))}
        ${row("positionSizeSol", cfg?.positionSizeSol ?? "missing", Number(cfg?.positionSizeSol) > 0 && Number(cfg?.positionSizeSol) <= 0.10, "Maximum 0.10 SOL")}
        ${row("maxOpenTrades", cfg?.maxOpenTrades ?? "missing", Number(cfg?.maxOpenTrades) === 1, "Maximum 1")}
        ${row("maxDailyLossSol", cfg?.maxDailyLossSol ?? "missing", Number(cfg?.maxDailyLossSol) > 0)}
        ${row("maxDailyLossCount", cfg?.maxDailyLossCount ?? "missing", Number(cfg?.maxDailyLossCount) > 0)}
        ${row("maxDrawdownPercent", cfg?.maxDrawdownPercent ?? "missing", Number(cfg?.maxDrawdownPercent) > 0)}
        ${row("compoundingEnabled", boolText(cfg?.compoundingEnabled), cfg?.compoundingEnabled === false)}
        ${row("averagingDownEnabled", boolText(cfg?.averagingDownEnabled), cfg?.averagingDownEnabled === false)}
        ${row("martingaleEnabled", boolText(cfg?.martingaleEnabled), cfg?.martingaleEnabled === false)}

        ${subhead("WALLET SOURCE — wallet_status.json")}
        ${row("connected", boolText(wallet?.connected), walletConnected)}
        ${row("walletAddress", wallet?.walletAddress || "missing", walletMatchesConfig, walletMatchesConfig ? "Matches live_config.json" : "Does not match config")}
        ${row("balanceSol", wallet?.balanceSol ?? "missing", Number.isFinite(Number(wallet?.balanceSol)))}
        ${row("latencyMs", wallet?.latencyMs ?? "missing", Number.isFinite(Number(wallet?.latencyMs)))}
        ${row("updatedAt", wallet?.updatedAt ? formatDate(wallet.updatedAt) : "missing", Boolean(wallet?.updatedAt), wallet?.updatedAt || "")}

        ${subhead("SAFETY AND FILE HEALTH")}
        ${row("Live JSONL", ledger.invalid === 0 ? `valid — ${ledger.rows.length} event(s)` : `${ledger.invalid} invalid line(s)`, ledger.invalid === 0, path.basename(LIVE_TRADES_FILE))}
        ${row("Required files", missingFiles.length ? `missing: ${missingFiles.join(", ")}` : "all present", missingFiles.length === 0)}
        ${row("Configuration schema", configInvalid ? `invalid: ${missingConfigFields.join(", ") || cfgParseError}` : "valid", !configInvalid)}
        ${row("Real trading capability", cfg?.dryRunMode === true ? "DISABLED — DRY RUN" : "BLOCKED", cfg?.dryRunMode === true)}
        ${row("liveArmed (computed)", armed ? (armed.liveArmed ? "true" : "false") : "unavailable", armed ? !armed.liveArmed : false, armed?.operationalPosture || "")}
        ${armed && !armed.liveArmed ? row("Live submission blocked", armed.failures[0] || "gates not satisfied", false, armed.failures.join("; ")) : ""}
      </tbody>
    </table>

    <div class="p1-execution-row">
      <div class="p1-execution-label">UNIFIED DASHBOARD STATUS</div>
      <div class="p1-execution-badge ${statusClass}">${unifiedStatus}</div>
      <div class="p1-execution-detail">${escapeHtml(
        missingFiles.length ? `Missing required files: ${missingFiles.join(", ")}` :
        blockers.length ? `Blocked by: ${blockers.join(", ")}` :
        cfg?.emergencyStop ? "Emergency stop is active." :
        "Current config, wallet status, and live JSONL pass dashboard readiness checks."
      )}</div>
    </div>

    <div class="p1-note">
      <strong>Single Source of Truth</strong><br>
      Config source: <code>live_config.json</code> · Wallet source: <code>wallet_status.json</code> ·
      Runtime source: <code>live_executor.js</code> · Replay source: <code>simulation_results.json</code>
    </div>
  </section>`;
}

function sharedStyles() {
  return `
      :root { color-scheme:dark; --bg:#05050a; --panel:#0a0c14; --line:#26324d; --muted:#8994aa; --text:#f0f6ff; --accent:#087cf0; --cyan:#05d9f5; --magenta:#f20a78; --green:#19d6a1; --red:#f52b3f; --amber:#ff9b0b; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:"Cascadia Code",Consolas,"Segoe UI",monospace; }
    main { max-width:1500px; margin:auto; padding:24px; }
    .hero-banner { position:relative; min-height:245px; margin-bottom:18px; overflow:hidden; border:1px solid rgba(19,239,255,.48); border-radius:8px; background:#070912; box-shadow:0 0 35px rgba(22,140,255,.14); }
      .hero-art { position:absolute; inset:0; background-image:linear-gradient(90deg,rgba(3,4,10,.91) 0%,rgba(3,4,10,.18) 52%,rgba(3,4,10,.76) 100%),url("/3rd-floor-labz-banner.png"); background-size:cover; background-position:center; filter:saturate(1.08) contrast(1.05); }
      .hero-art:after { content:""; position:absolute; inset:0; background:linear-gradient(to bottom,rgba(5,5,10,.08) 50%,rgba(5,5,10,.82) 100%); }
    .hero-overlay { position:relative; z-index:1; min-height:245px; display:flex; justify-content:space-between; gap:20px; align-items:end; padding:24px; }
    .brand { display:flex; gap:14px; align-items:center; } .brand-mark { width:58px; height:58px; display:grid; place-items:center; border:1px solid var(--cyan); color:var(--cyan); font-size:23px; font-weight:800; background:rgba(3,4,10,.65); box-shadow:0 0 22px rgba(19,239,255,.32),inset 0 0 16px rgba(255,22,143,.1); }
    h1,h2 { margin:0; } h1 { font-size:34px; text-transform:uppercase; letter-spacing:.08em; color:#fff; text-shadow:2px 2px 0 var(--magenta),-2px -2px 0 var(--accent),0 0 20px rgba(19,239,255,.4); } h2 { font-size:17px; margin-bottom:12px; color:var(--cyan); text-transform:uppercase; letter-spacing:.04em; }
    .brand-subtitle { color:#d7e9ff; font-size:12px; letter-spacing:.12em; text-transform:uppercase; margin-top:5px; } .brand-subtitle b { color:var(--magenta); }
    a { color:var(--cyan); text-decoration:none; } a:hover { color:var(--magenta); }
    nav { display:flex; gap:16px; margin-top:10px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
    .header-right { text-align:right; background:rgba(3,4,10,.72); border:1px solid rgba(22,140,255,.34); padding:13px; backdrop-filter:blur(4px); } .engine-badge { display:inline-block; border:1px solid rgba(255,178,26,.72); background:rgba(255,178,26,.09); color:var(--amber); border-radius:3px; padding:6px 9px; font-size:11px; text-transform:uppercase; letter-spacing:.07em; }
    .system-online { color:var(--cyan); font-size:11px; margin:8px 0; letter-spacing:.08em; } .system-online i,.status-row i { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--cyan); margin-right:7px; box-shadow:0 0 10px var(--cyan); animation:pulse 1.8s infinite; } @keyframes pulse { 50% { opacity:.45; } }
    .subtitle,.meta { color:var(--muted); font-size:13px; }
    .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:12px; margin:18px 0; }
    .thesis-cards { grid-template-columns:repeat(3,minmax(155px,1fr)); }
    .ideal-watch-cards { grid-template-columns:repeat(5,minmax(155px,1fr)); margin-bottom:0; }
    .card,.panel { background:linear-gradient(145deg,rgba(13,16,29,.98),rgba(6,8,15,.98)); border:1px solid var(--line); border-radius:5px; box-shadow:0 0 18px rgba(22,140,255,.045),inset 0 0 25px rgba(19,239,255,.012); }
    .card { padding:15px; position:relative; overflow:hidden; } .card:before { content:""; position:absolute; top:0; left:0; width:34px; height:2px; background:linear-gradient(90deg,var(--cyan),var(--magenta)); box-shadow:0 0 10px var(--cyan); } .label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; } .value { font-size:24px; font-weight:700; margin-top:7px; }
    .research-scorecard { background:linear-gradient(135deg,rgba(22,140,255,.09),rgba(255,22,143,.045),rgba(6,8,15,.98)); border:1px solid rgba(19,239,255,.34); border-radius:5px; padding:18px; margin:0 0 18px; }
    .scorecard-title { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:14px; }
    .scorecard-title span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    .scorecard-title strong { color:var(--cyan); font-size:18px; letter-spacing:.08em; }
    .scorecard-grid { display:grid; grid-template-columns:repeat(7,minmax(125px,1fr)); gap:10px; }
    .scorecard-grid div { background:rgba(2,8,6,.58); border:1px solid rgba(41,168,255,.18); border-radius:3px; padding:12px; }
    .scorecard-grid span { display:block; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
    .scorecard-grid strong { display:block; margin-top:6px; font-size:17px; }
    .confidence-low { color:var(--red); } .confidence-developing { color:var(--amber); } .confidence-moderate { color:var(--accent); } .confidence-high { color:var(--green); }
    .funnel-grid { display:grid; grid-template-columns:repeat(7,minmax(105px,1fr)); gap:18px; margin-top:16px; }
    .funnel-stage { position:relative; background:rgba(4,14,10,.75); border:1px solid var(--line); border-radius:3px; padding:13px; text-align:center; }
    .funnel-stage span { display:block; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
    .funnel-stage strong { display:block; margin-top:7px; font-size:24px; }
    .funnel-stage i { position:absolute; right:-16px; top:50%; transform:translateY(-50%); color:var(--accent); font-style:normal; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-bottom:16px; }
    .panel { padding:16px; overflow:auto; margin-bottom:16px; }
    .system-status-panel { display:grid; grid-template-columns:190px 1fr; gap:16px; align-items:center; background:rgba(8,10,18,.96); border:1px solid rgba(19,239,255,.3); padding:13px 16px; margin-bottom:18px; box-shadow:0 0 18px rgba(255,22,143,.04); }
    .terminal-label { color:var(--magenta); font-size:11px; letter-spacing:.12em; } .status-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; } .status-row { border-left:1px solid var(--line); padding-left:12px; } .status-row span { color:var(--muted); font-size:10px; display:block; } .status-row strong { color:var(--cyan); font-size:11px; display:block; margin-top:4px; }
    .warning-banner { background:rgba(255,201,40,.08); border:1px solid rgba(255,201,40,.5); color:var(--amber); border-radius:3px; padding:11px 12px; margin:0 0 14px; font-size:13px; font-weight:600; }
    .mini-stats { display:grid; grid-template-columns:repeat(4,minmax(120px,1fr)); gap:10px; margin:8px 0 18px; }
    .mini-stats div { background:rgba(10,13,24,.8); border:1px solid var(--line); border-radius:3px; padding:11px; }
    .mini-stats span { display:block; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
    .mini-stats strong { display:block; margin-top:5px; font-size:18px; }
    .table-heading { margin-top:8px; }
    .token-table-wrap { max-height:520px; overflow:auto; }
    .token-table-wrap th { position:sticky; top:0; background:var(--panel); z-index:1; }
    .failure-stats { margin-top:12px; }
    .failure-reasons { white-space:normal; min-width:260px; }
    .failure-reasons span { display:inline-block; background:rgba(255,59,85,.1); color:#ff7082; border:1px solid rgba(255,59,85,.32); border-radius:2px; padding:3px 7px; margin:2px 4px 2px 0; font-size:11px; }
    .candidate-summary { display:grid; grid-template-columns:repeat(4,minmax(145px,1fr)); gap:10px; margin:14px 0; }
    .candidate-summary div { border:1px solid currentColor; border-radius:3px; padding:10px 12px; background:rgba(5,8,14,.72); }
    .candidate-summary span { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.05em; }
    .candidate-summary strong { display:block; margin-top:5px; font-size:20px; }
    .candidate-badge { display:inline-block; border:1px solid currentColor; border-radius:2px; padding:4px 7px; font-size:10px; font-weight:700; letter-spacing:.04em; }
    .badge-hot { color:var(--green); } .candidate-badge.badge-hot { background:rgba(25,214,161,.1); box-shadow:0 0 10px rgba(25,214,161,.16); }
    .badge-strong { color:var(--cyan); } .candidate-badge.badge-strong { background:rgba(5,217,245,.1); }
    .badge-watch { color:var(--amber); } .candidate-badge.badge-watch { background:rgba(255,155,11,.1); }
    .badge-weak { color:var(--red); } .candidate-badge.badge-weak { background:rgba(245,43,63,.1); }
    tr.candidate-match td { background:rgba(25,214,161,.07); }
    tr.candidate-miss-one td { background:rgba(255,155,11,.07); }
    tr.candidate-miss-many td { background:rgba(245,43,63,.07); }
    .simulator-form { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin:15px 0 4px; }
    .simulator-form label { color:var(--muted); display:grid; gap:5px; font-size:10px; text-transform:uppercase; letter-spacing:.05em; }
    .simulator-form input { width:190px; border:1px solid var(--line); border-radius:3px; background:#050810; color:var(--text); font:inherit; padding:8px 9px; }
    .simulator-form button { border:1px solid var(--cyan); border-radius:3px; background:rgba(5,217,245,.09); color:var(--cyan); cursor:pointer; font:inherit; padding:8px 12px; text-transform:uppercase; }
    .simulator-form button:hover { border-color:var(--magenta); color:var(--magenta); }
    .sol-simulator-cards { margin-bottom:20px; }
    .simulator-recent-heading { margin-top:22px; }
    .projection-deemphasized { opacity:.48; }
    .hidden-projection summary { color:var(--amber); cursor:pointer; font-size:10px; text-transform:uppercase; }
    .hidden-projection span { display:block; margin-top:5px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { color:#70dfff; text-align:left; font-weight:600; border-bottom:1px solid var(--line); padding:9px 8px; text-transform:uppercase; font-size:10px; letter-spacing:.05em; }
    td { border-bottom:1px solid rgba(32,44,72,.7); padding:9px 8px; white-space:nowrap; }
    tr:last-child td { border-bottom:0; } .positive { color:var(--green); } .negative { color:var(--red); }
    .status { font-size:10px; padding:3px 7px; border-radius:2px; border:1px solid var(--line); background:#06110d; } .status.open { color:var(--accent); } .status.win { color:var(--green); } .status.loss { color:var(--red); } .status.timeout { color:var(--amber); }
    .empty { color:var(--muted); text-align:center; padding:18px; }
    @media(max-width:900px){ .grid{grid-template-columns:1fr;} .scorecard-grid{grid-template-columns:repeat(2,minmax(125px,1fr));} .funnel-grid,.status-grid,.candidate-summary{grid-template-columns:repeat(2,minmax(105px,1fr));} .system-status-panel{grid-template-columns:1fr;} .funnel-stage i{display:none;} .scorecard-title{align-items:start;flex-direction:column;} .thesis-cards,.ideal-watch-cards{grid-template-columns:1fr;} .mini-stats{grid-template-columns:repeat(2,minmax(120px,1fr));} .hero-overlay{align-items:start;flex-direction:column;} .header-right{text-align:left;} }

    /* ── Wallet Connection / RPC Health ──────────────────────────────────── */
    .wc-panel { border-color:rgba(5,217,245,.3); box-shadow:0 0 24px rgba(5,217,245,.05); margin-bottom:18px; }
    .wc-title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .wc-heading { color:var(--cyan); margin:0; }
    .wc-subtitle { color:var(--muted); font-size:12px; margin-bottom:12px; }
    .wc-health-badge { font-size:11px; font-weight:800; letter-spacing:.07em; padding:5px 13px; border-radius:3px; text-transform:uppercase; }
    .wc-green  { color:var(--green); border:1px solid var(--green); background:rgba(25,214,161,.12); box-shadow:0 0 12px rgba(25,214,161,.25); }
    .wc-yellow { color:var(--amber); border:1px solid var(--amber); background:rgba(255,155,11,.1); }
    .wc-red    { color:var(--red); border:1px solid var(--red); background:rgba(245,43,63,.1); }
    .wc-stale  { background:rgba(255,155,11,.07); border:1px solid rgba(255,155,11,.4); color:var(--amber); border-radius:3px; padding:9px 12px; margin-bottom:10px; font-size:12px; font-weight:600; }
    .wc-rpc-warn { background:rgba(245,43,63,.08); border:1px solid rgba(245,43,63,.45); color:#ff9aa8; border-radius:3px; padding:9px 12px; margin-bottom:10px; font-size:12px; font-weight:600; }
    .wc-stale code, .wc-rpc-warn code { background:rgba(255,255,255,.08); border:1px solid var(--line); border-radius:2px; padding:1px 5px; color:var(--cyan); }
    .wc-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:10px 0; }
    .wc-card { background:rgba(5,8,14,.6); border:1px solid var(--line); border-radius:4px; padding:11px 12px; }
    .wc-label { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
    .wc-value { font-size:16px; font-weight:700; margin-top:5px; }
    .wc-pos { color:var(--green); } .wc-neg { color:var(--red); } .wc-warn { color:var(--amber); }
    .wc-text-green { color:var(--green); } .wc-text-yellow { color:var(--amber); } .wc-text-red { color:var(--red); }
    /* ── End Wallet Connection / RPC Health ──────────────────────────────── */

    /* ── Live Automation Control ─────────────────────────────────────────── */
    .ac-panel { border-color:rgba(245,43,63,.4); box-shadow:0 0 30px rgba(245,43,63,.07),inset 0 0 40px rgba(5,217,245,.02); margin-bottom:18px; }
    .ac-title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
    .ac-heading { color:#fff; margin:0; }
    .ac-status-badge { font-size:12px; font-weight:800; letter-spacing:.08em; padding:6px 14px; border-radius:3px; text-transform:uppercase; }
    .ac-live      { color:var(--green); border:1px solid var(--green); background:rgba(25,214,161,.12); box-shadow:0 0 12px rgba(25,214,161,.25); }
    .ac-dryrun    { color:var(--amber); border:1px solid var(--amber); background:rgba(255,155,11,.1); }
    .ac-stopped   { color:var(--muted); border:1px solid var(--line); background:rgba(10,12,20,.8); }
    .ac-emergency { color:var(--red); border:1px solid var(--red); background:rgba(245,43,63,.12); animation:pulse 1.3s infinite; }
    .ac-dryrun-banner { background:rgba(255,155,11,.08); border:1px solid rgba(255,155,11,.4); color:var(--amber); border-radius:3px; padding:10px 13px; margin-bottom:10px; font-size:13px; font-weight:600; }
    .ac-live-banner { background:rgba(245,43,63,.08); border:1px solid rgba(245,43,63,.45); color:var(--red); border-radius:3px; padding:10px 13px; margin-bottom:10px; font-size:13px; font-weight:700; }
    .ac-emergency-banner { background:rgba(245,43,63,.12); border:1px solid var(--red); color:#ff8092; border-radius:3px; padding:11px 13px; margin-bottom:12px; font-size:13px; font-weight:600; }
    .ac-emergency-banner code, .ac-hint code { background:rgba(255,255,255,.08); border:1px solid var(--line); border-radius:2px; padding:1px 5px; color:var(--cyan); }
    .ac-buttons { display:flex; gap:12px; flex-wrap:wrap; margin:14px 0 8px; }
    .ac-form { margin:0; }
    .ac-btn { font:inherit; font-weight:800; letter-spacing:.05em; font-size:14px; padding:12px 26px; border-radius:5px; cursor:pointer; text-transform:uppercase; transition:all .15s; }
    .ac-btn-start { color:var(--green); border:1px solid var(--green); background:rgba(25,214,161,.1); }
    .ac-btn-start:hover:not(:disabled) { background:rgba(25,214,161,.22); box-shadow:0 0 14px rgba(25,214,161,.3); }
    .ac-btn-stop { color:var(--amber); border:1px solid var(--amber); background:rgba(255,155,11,.1); }
    .ac-btn-stop:hover { background:rgba(255,155,11,.22); }
    .ac-btn-emergency { color:#fff; border:1px solid var(--red); background:rgba(245,43,63,.55); }
    .ac-btn-emergency:hover { background:rgba(245,43,63,.8); box-shadow:0 0 16px rgba(245,43,63,.5); }
    .ac-btn:disabled { opacity:.4; cursor:not-allowed; }
    .ac-hint { color:var(--muted); font-size:11px; margin:6px 0; }
    .ac-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin:14px 0 4px; }
    .ac-stat { background:rgba(5,8,14,.6); border:1px solid var(--line); border-radius:4px; padding:11px 12px; }
    .ac-stat span { display:block; color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
    .ac-stat strong { display:block; margin-top:5px; font-size:15px; }
    .ac-text-live { color:var(--green); } .ac-text-dryrun { color:var(--amber); } .ac-text-stopped { color:var(--muted); } .ac-text-emergency { color:var(--red); }
    .ac-ok { color:var(--green); } .ac-fail { color:var(--red); }
    .ac-readiness { list-style:none; padding:0; margin:8px 0 0; columns:2; }
    .ac-readiness li { font-size:12px; padding:3px 0; break-inside:avoid; }
    .ac-readiness li span { color:var(--muted); }
    .ac-live-armed-strip { border-radius:3px; padding:11px 13px; margin-bottom:12px; font-size:13px; font-weight:600; }
    .ac-live-armed-no { background:rgba(25,214,161,.1); border:1px solid var(--green); color:#9ff5dc; }
    .ac-live-armed-yes { background:rgba(245,43,63,.14); border:1px solid var(--red); color:#ff9aa8; animation:pulse 1.3s infinite; }
    @media(max-width:900px){ .ac-readiness{columns:1;} .ac-buttons{flex-direction:column;} .ac-btn{width:100%;} }
    /* ── End Live Automation Control ─────────────────────────────────────── */

    /* ── Live Execution Dashboard ────────────────────────────────────────── */
    .le-panel { border-color:rgba(5,217,245,.35); box-shadow:0 0 28px rgba(5,217,245,.06),inset 0 0 40px rgba(5,217,245,.025); margin-bottom:18px; }
    .le-title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .le-heading { color:var(--cyan); margin:0; }
    .le-subtitle { color:var(--muted); font-size:12px; margin-bottom:14px; }
    .le-status-badge { font-size:11px; font-weight:700; letter-spacing:.07em; padding:5px 12px; border-radius:3px; text-transform:uppercase; }
    .le-status-live     { color:var(--green);   border:1px solid var(--green);   background:rgba(25,214,161,.1);  box-shadow:0 0 10px rgba(25,214,161,.2); }
    .le-status-standby  { color:var(--muted);   border:1px solid var(--line);    background:rgba(10,12,20,.8); }
    .le-status-stop     { color:var(--red);     border:1px solid var(--red);     background:rgba(245,43,63,.09);  box-shadow:0 0 10px rgba(245,43,63,.15); }
    .le-status-warn     { color:var(--amber);   border:1px solid var(--amber);   background:rgba(255,155,11,.08); }
    .le-warning-banner  { background:rgba(255,155,11,.07); border:1px solid rgba(255,155,11,.4); color:var(--amber); border-radius:3px; padding:10px 12px; margin:0 0 10px; font-size:13px; font-weight:600; }
    .le-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(148px,1fr)); gap:10px; margin:14px 0 16px; }
    .le-card  { background:rgba(5,217,245,.03); border:1px solid rgba(5,217,245,.14); border-radius:4px; padding:13px; position:relative; overflow:hidden; }
    .le-card:before { content:""; position:absolute; top:0; left:0; width:28px; height:2px; background:linear-gradient(90deg,var(--cyan),transparent); }
    .le-label { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.07em; }
    .le-value { font-size:18px; font-weight:700; margin-top:6px; }
    .le-positive { color:var(--green); }
    .le-negative { color:var(--red); }
    .le-warn     { color:var(--amber); }
    .le-daily-stop-row { display:grid; grid-template-columns:1fr 1fr auto; gap:16px; align-items:center; background:rgba(3,6,14,.6); border:1px solid var(--line); border-radius:4px; padding:14px 16px; margin:0 0 16px; }
    .le-ds-label { color:var(--muted); font-size:12px; margin-bottom:7px; }
    .le-ds-bar-track { background:rgba(255,255,255,.07); border-radius:2px; height:8px; overflow:hidden; }
    .le-ds-bar { height:8px; border-radius:2px; background:var(--accent); transition:width .3s; }
    .le-ds-bar-hit { background:var(--red); box-shadow:0 0 8px var(--red); }
    .le-ds-status { font-size:12px; font-weight:700; letter-spacing:.05em; text-align:right; white-space:nowrap; }
    .le-ds-ok      { color:var(--green); }
    .le-ds-stopped { color:var(--red); animation:pulse 1.4s infinite; }
    .le-note { color:var(--muted); font-size:11px; margin-bottom:10px; line-height:1.5; }
    .le-footer-note { color:var(--muted); font-size:11px; margin-top:14px; border-top:1px solid var(--line); padding-top:12px; }
    .le-footer-note code { background:rgba(255,255,255,.07); border:1px solid var(--line); border-radius:2px; padding:2px 5px; color:var(--cyan); font-size:11px; }
    .le-dryrun-badge { display:inline-block; background:rgba(255,155,11,.12); border:1px solid rgba(255,155,11,.4); color:var(--amber); border-radius:2px; padding:1px 5px; font-size:9px; font-weight:700; letter-spacing:.05em; vertical-align:middle; margin-left:4px; }
    @media(max-width:900px){ .le-daily-stop-row{grid-template-columns:1fr;} .le-ds-status{text-align:left;} }
    /* ── End Live Execution Dashboard ────────────────────────────────────── */

    /* ── Phase 1 Live Readiness ──────────────────────────────────────────── */
    .p1-panel { border-color:rgba(255,155,11,.45); box-shadow:0 0 28px rgba(255,155,11,.08),inset 0 0 40px rgba(255,155,11,.03); margin-bottom:18px; }
    .p1-title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .p1-heading { color:var(--amber); margin:0; }
    .p1-version-badge { font-size:10px; color:var(--muted); border:1px solid var(--line); border-radius:3px; padding:4px 8px; letter-spacing:.06em; }
    .p1-subtitle { color:var(--muted); font-size:12px; margin-bottom:18px; }
    .p1-table { width:100%; border-collapse:collapse; font-size:13px; margin-bottom:18px; }
    .p1-table td { border-bottom:1px solid rgba(32,44,72,.5); padding:7px 8px; vertical-align:middle; }
    .p1-table tr:last-child td { border-bottom:0; }
    .p1subhead td { background:rgba(255,155,11,.06); border-bottom:1px solid rgba(255,155,11,.2) !important; color:var(--amber); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; padding:8px 8px 6px; }
    .p1label { color:var(--muted); font-size:12px; display:flex; align-items:center; gap:8px; }
    .p1value { font-size:13px; font-weight:600; }
    .p1detail { color:var(--muted); font-size:11px; }
    .p1dot { display:inline-block; width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .p1dot-ok { background:var(--green); box-shadow:0 0 6px var(--green); }
    .p1dot-fail { background:var(--red); box-shadow:0 0 6px var(--red); }
    .p1dot-warn { background:var(--amber); box-shadow:0 0 6px var(--amber); }
    .p1ok { color:var(--green); }
    .p1fail { color:var(--red); }
    .p1warn { color:var(--amber); }
    .p1-execution-row { display:flex; align-items:center; gap:16px; margin:8px 0 14px; flex-wrap:wrap; }
    .p1-execution-label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; flex-shrink:0; }
    .p1-execution-badge { font-size:15px; font-weight:800; letter-spacing:.08em; padding:8px 18px; border-radius:4px; text-transform:uppercase; }
    .phase1-ready { color:var(--green); border:1px solid var(--green); background:rgba(25,214,161,.09); box-shadow:0 0 18px rgba(25,214,161,.15); }
    .phase1-partial { color:var(--amber); border:1px solid var(--amber); background:rgba(255,155,11,.08); }
    .phase1-notready { color:var(--red); border:1px solid var(--red); background:rgba(245,43,63,.07); }
    .p1-execution-detail { color:var(--muted); font-size:12px; }
    .p1-note { background:rgba(255,155,11,.05); border:1px solid rgba(255,155,11,.25); border-radius:3px; padding:11px 14px; color:var(--muted); font-size:12px; line-height:1.6; }
    .p1-note code { background:rgba(255,255,255,.08); border:1px solid var(--line); border-radius:2px; padding:2px 6px; color:var(--cyan); font-size:11px; }
    /* ── End Phase 1 ─────────────────────────────────────────────────────── */
  `;
}

function renderDashboard(settings = { positionSizeSol: 1, feePercent: 1 }) {
  const paper = readJsonLines(PAPER_FILE);
  const nearMisses = readJsonLines(NEAR_MISS_FILE);
  const followups = readJsonLines(FOLLOWUP_FILE);
  const openTrades = paper.rows.filter(trade => trade.status === "OPEN");
  const forwardTrades = paper.rows.filter(trade =>
    trade.strategyVersion === STRATEGY_VERSION &&
    trade.monitorVersion === MONITOR_VERSION
  );
  const forwardUnique = uniqueTokenAnalysis(forwardTrades);
  const historicalUnique = uniqueTokenAnalysis(paper.rows);
  const closed = forwardTrades
    .filter(trade => CLOSED_STATUSES.has(trade.status) && Number.isFinite(Number(trade.pnlPercent)))
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
  const pnl = closed.reduce((sum, trade) => sum + Number(trade.pnlPercent), 0);
  const warnings = validationSummary(paper.rows, paper.invalid);
  const warningTotal = Object.values(warnings).reduce((sum, count) => sum + count, 0);
  const followup = followupSummary(followups.rows);
  const botStats = groupStats(
    closed,
    botRateBucket,
    ["0-5%", "5-10%", "10-15%", "15-20%", "20%+", "Missing"]
  );
  const marketCapStats = groupStats(
    closed,
    marketCapBucket,
    ["<100k", "100k-250k", "250k-500k", "500k-1M", "1M+", "Missing"]
  );

  const warningRows = Object.entries(warnings)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `<tr><td>${escapeHtml(category)}</td><td>${count}</td></tr>`)
    .join("") || `<tr><td colspan="2" class="empty">No validation warnings.</td></tr>`;

  const followupRows = ["20m", "60m", "120m"].map(interval => {
    const item = followup.intervals[interval];
    return `<tr><td>${interval}</td><td>${item.measured}</td><td>${item.positive}</td><td class="${pnlClass(item.average)}">${item.average === null ? "-" : formatPercent(item.average)}</td></tr>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>3rd Floor Labz</title>
  <style>${sharedStyles()}</style>
</head>
<body>
<main>
  ${brandHeader("Dashboard Terminal")}

  ${systemStatusPanel()}

  ${phase1ReadinessPanel(forwardTrades)}

  ${liveAutomationControlPanel()}

  ${walletConnectionPanel()}

  ${rpcHealthPanel()}

  ${liveExecutionPanel()}

  ${liveVsPaperPanel()}

  ${researchScorecard(forwardTrades)}

  ${opportunityFunnel(nearMisses.rows, forwardTrades)}

  ${liveCandidateFeed(paper.rows)}

  ${positionSizeSimulator(closed)}

  ${solTradeSimulator(closed, settings)}

  <div class="cards">
    ${statCard("Open Trades", openTrades.length)}
    ${statCard("Unique Tokens Traded", forwardUnique.uniqueTokens)}
    ${statCard("Total Forward-Test Trades", forwardUnique.totalTrades)}
    ${statCard("Re-Entry Rate", formatPercent(forwardUnique.reentryRate * 100), forwardUnique.reentryRate > 0.20 ? "negative" : "")}
    ${statCard("Unique Token Ratio", formatPercent(forwardUnique.uniqueRatio * 100), forwardUnique.uniqueRatio < 0.80 && forwardUnique.totalTrades ? "negative" : "positive")}
    ${statCard("Forward Closed", closed.length)}
    ${statCard("Wins", closed.filter(trade => trade.status === "WIN").length)}
    ${statCard("Losses", closed.filter(trade => trade.status === "LOSS").length)}
    ${statCard("Timeouts", closed.filter(trade => trade.status === "TIMEOUT").length)}
    ${statCard("Average PnL", formatPercent(closed.length ? pnl / closed.length : 0), pnlClass(closed.length ? pnl / closed.length : 0))}
    ${statCard("Summed PnL", formatPercent(pnl), pnlClass(pnl))}
    ${statCard("Validation Warnings", warningTotal, warningTotal ? "negative" : "positive")}
  </div>

  <h2>Unique Token Analysis</h2>
  <div class="grid">
    ${concentrationPanel("Forward Test", forwardUnique)}
    ${concentrationPanel("All Historical Trades", historicalUnique)}
  </div>

  ${idealSetupWatch(forwardTrades)}

  ${thesisPanel(forwardTrades)}

  ${marketCapThesisWatch(forwardTrades)}

  <section class="panel">
    <h2>Open Trades</h2>
    <table><thead><tr><th>Symbol</th><th>Status</th><th>Score</th><th>Market Cap</th><th>Bot Rate</th><th>Top10</th><th>PnL</th><th>Opened</th></tr></thead><tbody>${tradeRows(openTrades)}</tbody></table>
  </section>

  <section class="panel">
    <h2>Recent 20 Closed Forward-Test Trades</h2>
    <table><thead><tr><th>Symbol</th><th>Status</th><th>Score</th><th>Market Cap</th><th>Bot Rate</th><th>Top10</th><th>PnL</th><th>Trigger</th><th>Closed</th></tr></thead><tbody>${tradeRows(closed.slice(0, 20), true)}</tbody></table>
  </section>

  <div class="grid">
    <section class="panel">
      <h2>Performance By Bot Rate</h2>
      <table><thead><tr><th>Bucket</th><th>Trades</th><th>Win Rate</th><th>Average</th><th>Summed PnL</th></tr></thead><tbody>${bucketRows(botStats)}</tbody></table>
    </section>
    <section class="panel">
      <h2>Performance By Market Cap</h2>
      <table><thead><tr><th>Bucket</th><th>Trades</th><th>Win Rate</th><th>Average</th><th>Summed PnL</th></tr></thead><tbody>${bucketRows(marketCapStats)}</tbody></table>
    </section>
  </div>

  <div class="grid">
    <section class="panel">
      <h2>Near-Miss Followups</h2>
      <div class="subtitle">${nearMisses.rows.length} near misses | ${followup.total} tracked | ${followup.complete} complete | ${nearMisses.invalid + followups.invalid} invalid rows</div>
      <table><thead><tr><th>Interval</th><th>Measured</th><th>Positive</th><th>Average PnL</th></tr></thead><tbody>${followupRows}</tbody></table>
    </section>
    <section class="panel">
      <h2>Validation Warnings</h2>
      <div class="subtitle">Historical legacy records are expected to produce version and accounting warnings.</div>
      <table><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>${warningRows}</tbody></table>
    </section>
  </div>
</main>
</body>
</html>`;
}

function renderWinnersAnalysis() {
  const paper = readJsonLines(PAPER_FILE);
  const closed = paper.rows.filter(trade =>
    CLOSED_STATUSES.has(trade.status) &&
    Number.isFinite(Number(trade.pnlPercent))
  );
  const winners = closed
    .filter(trade => Number(trade.pnlPercent) > 0)
    .sort((a, b) => Number(b.pnlPercent) - Number(a.pnlPercent));
  const losers = closed
    .filter(trade => Number(trade.pnlPercent) < 0)
    .sort((a, b) => Number(a.pnlPercent) - Number(b.pnlPercent));
  const winnerAverage = winnerLoserAverages(winners);
  const loserAverage = winnerLoserAverages(losers);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>3rd Floor Labz | Winners Analysis</title>
  <style>${sharedStyles()}</style>
</head>
<body>
<main>
  ${brandHeader(`Winners Analysis | ${closed.length} closed | ${winners.length} profitable | ${losers.length} losing`)}

  ${systemStatusPanel()}

  <section class="panel"><h2>Winners Analysis</h2><div class="subtitle">All closed trades ranked by realized PnL sign, including legacy records</div></section>

  <section class="panel">
    <h2>Winning vs Losing Trade Averages</h2>
    <table>
      <thead><tr><th>Metric</th><th>Winning Trades</th><th>Losing Trades</th></tr></thead>
      <tbody>${comparisonRows(winnerAverage, loserAverage)}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Top 50 Winners</h2>
    <table>
      <thead><tr><th>Rank</th><th>Symbol</th><th>Score</th><th>Bot Rate</th><th>Market Cap</th><th>Top10</th><th>Liquidity</th><th>Source</th><th>PnL</th></tr></thead>
      <tbody>${winnerLoserRows(winners.slice(0, 50))}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Top 50 Losers</h2>
    <table>
      <thead><tr><th>Rank</th><th>Symbol</th><th>Score</th><th>Bot Rate</th><th>Market Cap</th><th>Top10</th><th>Liquidity</th><th>Source</th><th>PnL</th></tr></thead>
      <tbody>${winnerLoserRows(losers.slice(0, 50))}</tbody>
    </table>
  </section>
</main>
</body>
</html>`;
}

app.get("/3rd-floor-labz-banner.png", (req, res) => {
  res.sendFile(BANNER_FILE);
});

app.get("/", (req, res) => {
  try {
    const requestedPosition = Number(req.query.positionSol);
    const requestedFee = Number(req.query.feePercent);
    const settings = {
      positionSizeSol: Number.isFinite(requestedPosition) && requestedPosition > 0 ? requestedPosition : 1,
      feePercent: Number.isFinite(requestedFee) && requestedFee >= 0 ? requestedFee : 1
    };
    res.type("html").send(renderDashboard(settings));
  } catch (err) {
    res.status(500).type("text").send(`Dashboard error: ${err.message}`);
  }
});

app.get("/winners", (req, res) => {
  try {
    res.type("html").send(renderWinnersAnalysis());
  } catch (err) {
    res.status(500).type("text").send(`Winners analysis error: ${err.message}`);
  }
});

// ─── Live automation control endpoints ────────────────────────────────────────
// Each writes live_config.json and logs to live_control_events.jsonl via the
// executor's control functions. All redirect back to the dashboard.

function handleControl(fn, res, successQuery) {
  try {
    if (!liveExecutor) {
      return res.redirect("/?control=error&msg=" + encodeURIComponent("live_executor not loaded"));
    }
    const result = fn();
    if (result && result.ok === false) {
      return res.redirect("/?control=error&msg=" + encodeURIComponent(result.error || "rejected"));
    }
    return res.redirect("/?control=" + successQuery);
  } catch (err) {
    return res.redirect("/?control=error&msg=" + encodeURIComponent(err.message));
  }
}

app.post("/control/start", (req, res) => {
  handleControl(() => liveExecutor.startAutomation("START button (dashboard)"), res, "started");
});

app.post("/control/stop", (req, res) => {
  handleControl(() => liveExecutor.stopAutomation("STOP button (dashboard)"), res, "stopped");
});

app.post("/control/emergency", (req, res) => {
  handleControl(() => liveExecutor.emergencyStopControl("EMERGENCY STOP button (dashboard)"), res, "emergency");
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
