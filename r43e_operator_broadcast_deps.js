"use strict";

// r43e_operator_broadcast_deps.js — R43E-3 operator-only broadcast dependency adapter.
// Isolated one-transaction proof path. Does NOT integrate with live_executor.js.

const fs = require("fs");
const https = require("https");
const path = require("path");
const r42 = require("./r42_final_micro_live_review");
const r43c = require("./r43c_local_signer_readiness");
const r43d = require("./r43d_final_proof_preflight");
const localSigner = require("./local_signer");
const rpcConfig = require("./micro_live_rpc_config");

function r43eHarness() {
  return require("./r43e_one_transaction_proof_harness");
}

const OPERATOR_DEPS_BLOCKED = "R43E_OPERATOR_DEPS_BLOCKED";
const REAL_TRANSACTION_BUILD_NOT_IMPLEMENTED = "REAL_TRANSACTION_BUILD_NOT_IMPLEMENTED";

const JUPITER_SWAP_BASE_DEFAULT = "https://lite-api.jup.ag/swap/v1";
const JUPITER_QUOTE_PATH = "/quote";
const JUPITER_SWAP_PATH = "/swap";
const FORBIDDEN_PATH_MARKERS = Object.freeze(["/execute", "/submit", "/swap-instructions"]);
const LAMPORTS_PER_SOL = 1e9;

function throwOperatorDepsBlocked(message) {
  throw Object.assign(new Error(message || "operator broadcast deps blocked"), {
    code: OPERATOR_DEPS_BLOCKED
  });
}

function throwBuildNotImplemented(message) {
  throw Object.assign(new Error(message || "real transaction build not implemented"), {
    code: REAL_TRANSACTION_BUILD_NOT_IMPLEMENTED
  });
}

function isForbiddenUrlPath(pathname) {
  const normalized = String(pathname || "").toLowerCase();
  return FORBIDDEN_PATH_MARKERS.some((marker) => normalized.includes(marker));
}

function validateQuoteUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, reason: "invalid quote URL" };
  }
  if (isForbiddenUrlPath(parsed.pathname)) {
    return { ok: false, reason: "forbidden Jupiter quote path" };
  }
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (!pathname.endsWith("/quote")) {
    return { ok: false, reason: "quote URL must end with /quote" };
  }
  return { ok: true };
}

function validateSwapUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, reason: "invalid swap URL" };
  }
  if (isForbiddenUrlPath(parsed.pathname)) {
    return { ok: false, reason: "forbidden Jupiter swap path" };
  }
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (!pathname.endsWith("/swap")) {
    return { ok: false, reason: "swap URL must end with /swap" };
  }
  if (pathname.includes("/execute") || pathname.includes("/submit")) {
    return { ok: false, reason: "execute/submit swap paths blocked" };
  }
  return { ok: true };
}

function buildJupiterQuoteUrl(baseUrl, params) {
  const normalized = String(baseUrl).replace(/\/+$/, "");
  return `${normalized}${JUPITER_QUOTE_PATH}?${params.toString()}`;
}

function buildJupiterSwapUrl(baseUrl) {
  const normalized = String(baseUrl).replace(/\/+$/, "");
  return `${normalized}${JUPITER_SWAP_PATH}`;
}

function proofTargetUsesScanner(target) {
  if (!target || typeof target !== "object") return false;
  if (target.fromScanner === true || target.scannerCandidate === true) return true;
  if (target.scannerCandidateId || target.candidateSource === "scanner") return true;
  if (typeof target.source === "string" && /scanner/i.test(target.source)) return true;
  return false;
}

function collectOperatorDepsBlockers(options = {}) {
  const blockers = [];
  const cli = options.cli || {};
  const repoRoot = options.repoRoot || r43eHarness().ROOT;
  const runtimeRoot = options.runtimeRoot || r43eHarness().RUNTIME_ROOT;

  if (options.allowOperatorBroadcastDeps !== true) {
    blockers.push("allowOperatorBroadcastDeps must be true");
    return { ok: false, blockers };
  }

  const broadcastCli = r43eHarness().validateRealProofBroadcastCli(cli);
  if (!broadcastCli.ok) blockers.push(...broadcastCli.blockers);

  const r43dStatus = options.r43dStatusSummary !== undefined
    ? options.r43dStatusSummary
    : r43d.collectR43dFinalProofPreflight({
      repoRoot,
      runtimeRoot,
      analysisDir: options.analysisDir || r43eHarness().OUTPUT_DIR,
      humanPresent: cli.humanPresent === true,
      cli: { humanPresent: cli.humanPresent === true },
      runSecretScan: options.runSecretScan,
      ...options
    });

  const simulationStatus = options.simulationStatusSummary !== undefined
    ? options.simulationStatusSummary
    : {
      r43eVerdict: r43eHarness().VERDICTS.COMPLETED,
      transactionSubmitted: false
    };

  const capsLoad = options.capsLoad !== undefined
    ? options.capsLoad
    : require("./micro_live_caps").loadCapsFile(path.join(repoRoot, "operator_records", "micro_live_demo_caps.json"));
  const caps = capsLoad.data;
  const proofScopeCaps = options.proofScopeCapsCheck !== undefined
    ? options.proofScopeCapsCheck
    : r43eHarness().validateProofScopeCaps(caps);

  const proofTargetLoad = options.proofTargetLoad !== undefined
    ? options.proofTargetLoad
    : r43eHarness().loadProofTargetConfig(repoRoot, options);
  const proofTargetValidation = proofTargetLoad.status === "present"
    ? r43eHarness().validateProofTarget(proofTargetLoad.data)
    : { ok: false, errors: [`proof target ${proofTargetLoad.status}`] };

  const localSecretSource = options.localSecretSourceCheck !== undefined
    ? options.localSecretSourceCheck
    : r43d.classifyLocalSignerSecretPresence({ repoRoot, env: options.env });

  const executorIntegration = options.executorIntegrationCheck !== undefined
    ? options.executorIntegrationCheck
    : r42.checkExecutorIntegration(repoRoot);

  const r43cStatus = options.r43cStatusSummary !== undefined
    ? options.r43cStatusSummary
    : r43c.buildStatus({ repoRoot, runtimeRoot, analysisDir: options.analysisDir, runSecretScan: false, ...options });

  const rpcLoad = options.rpcLoad !== undefined
    ? options.rpcLoad
    : rpcConfig.loadMicroLiveRpcConfig({ repoRoot, env: options.env });

  if (r43dStatus.r43dVerdict !== r43d.VERDICTS.READY) {
    blockers.push(`R43D preflight not ready: ${r43dStatus.r43dVerdict}`);
    for (const item of r43dStatus.blockers || []) {
      if (!blockers.includes(item)) blockers.push(item);
    }
  }
  if (simulationStatus.r43eVerdict !== r43eHarness().VERDICTS.COMPLETED) {
    blockers.push(`R43E simulation not completed: ${simulationStatus.r43eVerdict}`);
  }
  if (!proofScopeCaps.ok) {
    blockers.push(`proof scope caps invalid: ${proofScopeCaps.errors.join("; ")}`);
  }
  if (proofTargetLoad.status !== "present") {
    blockers.push(`proof target config ${proofTargetLoad.status}: ${r43eHarness().TARGET_CONFIG_REL}`);
  }
  if (!proofTargetValidation.ok) {
    blockers.push(`proof target invalid: ${proofTargetValidation.errors.join("; ")}`);
  }
  if (proofTargetLoad.data && proofTargetUsesScanner(proofTargetLoad.data)) {
    blockers.push("scanner candidate cannot be used as proof target");
  }
  if (r43cStatus.r43cVerdict !== r43c.VERDICTS.READY) {
    blockers.push(`R43C signer not ready: ${r43cStatus.r43cVerdict}`);
  }
  if (!executorIntegration.ok) {
    blockers.push("live_executor signer integration detected");
  }
  if (!localSecretSource.envSecretJsonPresent && !localSecretSource.keyfilePathPresent) {
    blockers.push("local signer secret source required for operator broadcast deps");
  }

  const rpcStatus = rpcLoad.status || rpcLoad.safeMetadata?.status;
  if (rpcStatus !== rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE) {
    blockers.push(`dedicated RPC required (status=${rpcStatus || "MISSING"})`);
  }

  const posture = r43dStatus.postureStatus || {};
  if (posture.executionMode !== "PIPELINE_DRY_RUN") {
    blockers.push("executionMode must be PIPELINE_DRY_RUN");
  }
  if (posture.dryRunMode !== true) {
    blockers.push("dryRunMode must be true");
  }
  if (posture.liveArmed === true) {
    blockers.push("liveArmed must be false");
  }
  if (r43dStatus.tradingState?.recoveryPresent === true) {
    blockers.push("recovery_actions.jsonl present");
  }
  if (Number(r43dStatus.tradingState?.livePositionsOpen) > 0) {
    blockers.push("open live position blocks operator broadcast deps");
  }
  if (r43dStatus.executorStatus?.duplicateLoop === true) {
    blockers.push("duplicate executor loop active");
  }

  return {
    ok: blockers.length === 0,
    blockers,
    r43dStatus,
    simulationStatus,
    caps,
    proofTargetLoad,
    proofTargetValidation,
    localSecretSource,
    executorIntegration,
    r43cStatus,
    rpcLoad
  };
}

function createBlockedOperatorDeps(reason) {
  const blocked = () => throwOperatorDepsBlocked(reason);
  return {
    blocked: true,
    blockReason: reason,
    operatorBroadcastDepsEnabled: false,
    fetchJupiterQuote: blocked,
    fetchJupiterSwapTransaction: blocked,
    loadGuardedLocalSigner: blocked,
    signSwapTransaction: blocked,
    sendRawTransaction: blocked
  };
}

function defaultHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method || "GET";
    const headers = options.headers || {};
    const body = options.body;
    const req = https.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          body: data
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function resolveDedicatedRpcUrl(options = {}, gateContext = {}) {
  if (options.dedicatedRpcUrl) return options.dedicatedRpcUrl;
  const resolved = rpcConfig.resolveMicroLiveRpcUrl({
    repoRoot: options.repoRoot || r43eHarness().ROOT,
    env: options.env
  });
  if (!resolved.rpcUrl) {
    throwOperatorDepsBlocked("dedicated RPC URL not configured");
  }
  const classified = rpcConfig.classifyRpcUrl(resolved.rpcUrl, options);
  if (classified.status !== rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE) {
    throwOperatorDepsBlocked(`dedicated RPC status ${classified.status}`);
  }
  gateContext.rpcMetadata = gateContext.rpcMetadata || {};
  gateContext.rpcMetadata.redactedUrl = classified.redactedUrl;
  gateContext.rpcMetadata.status = classified.status;
  return resolved.rpcUrl;
}

function buildSignerGuardOptions(context, options = {}) {
  return {
    allowRealLocalSigner: true,
    caps: context.caps,
    posture: context.r43dStatus?.postureStatus,
    rpcStatus: context.rpcMetadata?.status || rpcConfig.RPC_STATUS.DEDICATED_CANDIDATE,
    humanPresent: context.cli?.humanPresent === true,
    recoveryPresent: context.r43dStatus?.tradingState?.recoveryPresent === true,
    executorSignerIntegrated: false,
    liveExecutorIntegration: false,
    repoRoot: options.repoRoot || r43eHarness().ROOT,
    env: options.env,
    testFixtureSecret: options.testFixtureSecret === true,
    testSecretBytes: options.testSecretBytes
  };
}

function createOperatorBroadcastDeps(options = {}) {
  const validation = collectOperatorDepsBlockers(options);
  if (!validation.ok) {
    return createBlockedOperatorDeps(validation.blockers.join("; "));
  }

  const httpRequest = options.httpRequest || defaultHttpRequest;
  const jupiterBaseUrl = options.jupiterSwapBaseUrl || JUPITER_SWAP_BASE_DEFAULT;
  const gateContext = {
    r43dStatus: validation.r43dStatus,
    caps: validation.caps,
    proofTarget: validation.proofTargetLoad.data,
    rpcMetadata: {
      status: validation.rpcLoad.status,
      source: validation.rpcLoad.source,
      redactedUrl: validation.rpcLoad.redactedUrl || "[REDACTED]"
    }
  };

  let dedicatedRpcUrl = null;
  try {
    dedicatedRpcUrl = resolveDedicatedRpcUrl(options, gateContext);
  } catch (err) {
    return createBlockedOperatorDeps(err.message);
  }

  const loadGuardedLocalSigner = (context) => {
    const guardOptions = buildSignerGuardOptions({ ...context, ...gateContext }, options);
    const signer = localSigner.createLocalSignerReal(guardOptions);
    return {
      getPublicKey: () => signer.getPublicKey(),
      getSafeAuditMetadata: () => signer.getSafeAuditMetadata(),
      destroy: () => signer.destroy()
    };
  };

  return {
    blocked: false,
    blockReason: null,
    operatorBroadcastDepsEnabled: true,
    gateContext,
    dedicatedRpcUrlRedacted: gateContext.rpcMetadata.redactedUrl,

    fetchJupiterQuote: async (context) => {
      const target = context.proofTarget || gateContext.proofTarget;
      if (!target || proofTargetUsesScanner(target)) {
        throwOperatorDepsBlocked("scanner candidate cannot be used as proof target");
      }
      const amountLamports = Math.round(Number(target.amountSol) * LAMPORTS_PER_SOL);
      if (!Number.isFinite(amountLamports) || amountLamports <= 0) {
        throwBuildNotImplemented("invalid proof target amountSol");
      }
      const params = new URLSearchParams({
        inputMint: target.inputMint,
        outputMint: target.outputMint,
        amount: String(amountLamports),
        slippageBps: String(target.slippageBps ?? 300),
        swapMode: "ExactIn"
      });
      const url = buildJupiterQuoteUrl(jupiterBaseUrl, params);
      const urlCheck = validateQuoteUrl(url);
      if (!urlCheck.ok) throwBuildNotImplemented(urlCheck.reason);

      const response = await httpRequest(url, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throwBuildNotImplemented(`Jupiter quote HTTP ${response.statusCode}`);
      }
      let quote;
      try {
        quote = JSON.parse(response.body);
      } catch {
        throwBuildNotImplemented("Jupiter quote response parse failed");
      }
      if (!quote || !quote.inputMint || !quote.outputMint) {
        throwBuildNotImplemented("Jupiter quote response malformed");
      }
      quote.slippageBps = Number(target.slippageBps ?? quote.slippageBps ?? 300);
      return quote;
    },

    fetchJupiterSwapTransaction: async (context, quote) => {
      const swapUrl = buildJupiterSwapUrl(jupiterBaseUrl);
      const urlCheck = validateSwapUrl(swapUrl);
      if (!urlCheck.ok) throwBuildNotImplemented(urlCheck.reason);

      const signer = loadGuardedLocalSigner(context);
      const userPublicKey = signer.getPublicKey();
      const requestBody = JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        asLegacyTransaction: false,
        dynamicComputeUnitLimit: false
      });

      const response = await httpRequest(swapUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: requestBody
      });
      if (!response.ok) {
        throwBuildNotImplemented(`Jupiter swap build HTTP ${response.statusCode}`);
      }
      let json;
      try {
        json = JSON.parse(response.body);
      } catch {
        throwBuildNotImplemented("Jupiter swap response parse failed");
      }
      if (!json || typeof json.swapTransaction !== "string" || !json.swapTransaction) {
        throwBuildNotImplemented("Jupiter swap transaction missing");
      }
      if (json.setupTransaction || json.cleanupTransaction || Array.isArray(json.transactions)) {
        throwBuildNotImplemented("split Jupiter transactions not allowed");
      }
      return {
        swapTransactionBase64: json.swapTransaction,
        lastValidBlockHeight: json.lastValidBlockHeight ?? null
      };
    },

    loadGuardedLocalSigner,

    signSwapTransaction: async (signer, swapTx, context) => {
      try {
        localSigner.validateSignerGuardContext(buildSignerGuardOptions({ ...context, ...gateContext }, options), {
          allowRealLocalSigner: true,
          checkAllowReal: true
        });
        const loaded = options.testFixtureSecret === true
          ? localSigner.loadSecretBytesFromApprovedSource({
            testFixtureSecret: true,
            testSecretBytes: options.testSecretBytes
          })
          : localSigner.loadSecretBytesFromApprovedSource({
            repoRoot: options.repoRoot || r43eHarness().ROOT,
            env: options.env
          });
        const { VersionedTransaction, Keypair } = require("@solana/web3.js");
        const keypair = Keypair.fromSecretKey(loaded.secretBytes);
        if (keypair.publicKey.toBase58() !== signer.getPublicKey()) {
          throwBuildNotImplemented("signer public key mismatch");
        }
        const tx = VersionedTransaction.deserialize(
          Buffer.from(swapTx.swapTransactionBase64, "base64")
        );
        tx.sign([keypair]);
        return {
          signedTransactionBase64: Buffer.from(tx.serialize()).toString("base64"),
          publicKey: keypair.publicKey.toBase58()
        };
      } catch (err) {
        if (err.code === OPERATOR_DEPS_BLOCKED || err.code === REAL_TRANSACTION_BUILD_NOT_IMPLEMENTED) {
          throw err;
        }
        throwBuildNotImplemented(err && err.message ? err.message : String(err));
      }
    },

    sendRawTransaction: async (payload = {}) => {
      if (options.sendRawTransactionImpl) {
        return options.sendRawTransactionImpl(payload);
      }
      const rpcUrl = dedicatedRpcUrl;
      const wire = payload.signedTransaction;
      if (!rpcUrl || !wire) {
        throwBuildNotImplemented("broadcast payload incomplete");
      }
      const { Connection } = require("@solana/web3.js");
      const connection = new Connection(rpcUrl, "confirmed");
      const signature = await connection.sendRawTransaction(
        Buffer.from(wire, "base64"),
        { skipPreflight: false, maxRetries: 0 }
      );
      return { signature };
    }
  };
}

module.exports = {
  OPERATOR_DEPS_BLOCKED,
  REAL_TRANSACTION_BUILD_NOT_IMPLEMENTED,
  JUPITER_SWAP_BASE_DEFAULT,
  JUPITER_QUOTE_PATH,
  JUPITER_SWAP_PATH,
  FORBIDDEN_PATH_MARKERS,
  validateQuoteUrl,
  validateSwapUrl,
  buildJupiterQuoteUrl,
  buildJupiterSwapUrl,
  proofTargetUsesScanner,
  collectOperatorDepsBlockers,
  createBlockedOperatorDeps,
  createOperatorBroadcastDeps
};
