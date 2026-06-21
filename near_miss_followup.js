const axios = require("axios");
const fs = require("fs");

const DEX = "https://api.dexscreener.com";
const NEAR_MISS_FILE = "near_misses.json";
const FOLLOWUP_FILE = "near_miss_followups.json";
const WATCH_MODE = process.argv.includes("--watch");
const FOLLOWUP_MINUTES = [20, 60, 120];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];

  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function saveJsonLines(file, rows) {
  fs.writeFileSync(
    file,
    rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "")
  );
}

async function getPairPrice(pairAddress) {
  try {
    const response = await axios.get(`${DEX}/latest/dex/pairs/solana/${pairAddress}`);
    const pairs = [
      response.data.pair,
      ...(response.data.pairs || [])
    ].filter(Boolean);
    const pair = pairs.find(
      p => p.pairAddress?.toLowerCase() === pairAddress.toLowerCase()
    );

    return pair ? Number(pair.priceUsd || 0) : null;
  } catch {
    return null;
  }
}

function followupKey(nearMiss) {
  return `${nearMiss.address}|${nearMiss.timestamp}`;
}

function createFollowup(nearMiss) {
  return {
    nearMissKey: followupKey(nearMiss),
    timestamp: nearMiss.timestamp,
    address: nearMiss.address,
    pairAddress: nearMiss.pairAddress,
    symbol: nearMiss.symbol,
    rejectionReason: nearMiss.reason,
    referencePrice: Number(nearMiss.referencePrice || 0),
    measurements: {}
  };
}

async function updateFollowups() {
  const nearMisses = readJsonLines(NEAR_MISS_FILE);
  const followups = readJsonLines(FOLLOWUP_FILE);
  const byKey = new Map(followups.map(row => [row.nearMissKey, row]));
  const now = Date.now();
  let changed = false;
  let ineligible = 0;

  for (const nearMiss of nearMisses) {
    if (!nearMiss.pairAddress || !Number(nearMiss.referencePrice || 0)) {
      ineligible += 1;
      continue;
    }

    const key = followupKey(nearMiss);
    let followup = byKey.get(key);

    if (!followup) {
      followup = createFollowup(nearMiss);
      followups.push(followup);
      byKey.set(key, followup);
      changed = true;
    }

    const timestamp = new Date(followup.timestamp).getTime();
    if (!Number.isFinite(timestamp)) continue;

    const dueIntervals = FOLLOWUP_MINUTES.filter(minutes =>
      now >= timestamp + minutes * 60 * 1000 &&
      !followup.measurements[`${minutes}m`]
    );

    if (!dueIntervals.length) continue;

    const price = await getPairPrice(followup.pairAddress);
    if (!price) continue;

    const observedAt = new Date().toISOString();
    const pnlPercent = Number(
      (((price - followup.referencePrice) / followup.referencePrice) * 100).toFixed(2)
    );

    for (const minutes of dueIntervals) {
      const targetAt = timestamp + minutes * 60 * 1000;

      followup.measurements[`${minutes}m`] = {
        targetAt: new Date(targetAt).toISOString(),
        observedAt,
        observationDelayMinutes: Number(((now - targetAt) / 60000).toFixed(2)),
        price,
        pnlPercent
      };
    }

    changed = true;
    console.log(`${followup.symbol} | Follow-up ${dueIntervals.join(", ")} | PnL ${pnlPercent}%`);
    await sleep(250);
  }

  if (changed) saveJsonLines(FOLLOWUP_FILE, followups);

  const complete = followups.filter(row =>
    FOLLOWUP_MINUTES.every(minutes => row.measurements?.[`${minutes}m`])
  ).length;

  console.log(
    `Near misses: ${nearMisses.length} | Follow-ups: ${followups.length} | Complete: ${complete} | Legacy/ineligible: ${ineligible}`
  );
}

async function main() {
  if (!WATCH_MODE) {
    await updateFollowups();
    return;
  }

  while (true) {
    await updateFollowups();
    console.log("Next near-miss follow-up cycle in 60 seconds. Press Ctrl+C to stop.");
    await sleep(60000);
  }
}

main().catch(err => console.error("Fatal error:", err.message));
