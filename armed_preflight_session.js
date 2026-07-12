"use strict";

const fs = require("fs");
const path = require("path");
const common = require("./live_validation_common");
const g1ProofDay = require("./armed_g1_proof_day");

const SESSION_ID_PATTERN = /^RB-G9-\d{8}-AP\d{2}$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const PROOF_CONTEXT = "armed-no-submit-proof";
const AP15_REPLACEMENT_ID = "armed-no-submit-proof-scope";

const FORBIDDEN_SESSION_IDS = Object.freeze([
  "RB-G9-20260706-EV01",
  "RB-G9-20260707-EV02"
]);

const FORBIDDEN_PATH_MARKERS = Object.freeze([
  "RB-G9-20260706-EV01",
  "RB-G9-20260707-EV02",
  "20260706-EV01",
  "20260707-EV02"
]);

const AUTH_CLASS_LABELS = Object.freeze({
  g1: "Fresh R15 engineering-validation authorization",
  g2: "Arming authorization",
  g3: "Runtime R15 stub creation authorization",
  g4: "Armed No-Submit Proof authorization"
});

const G4_PROOF_MARKERS = Object.freeze([
  "Armed No-Submit Proof",
  "Armed No-Submit Proof Authorization"
]);

const G4_MICRO_LIVE_MARKERS = Object.freeze([
  "Micro-Live Execution",
  "Micro-Live Execution Authorization"
]);

const G4_REQUIRED_PROHIBITIONS = Object.freeze([
  "submit",
  "sign",
  "broadcast",
  "candidate selection",
  "capital exposure"
]);

function normalizeSessionId(value) {
  return String(value || "").trim();
}

function validateSessionId(sessionId) {
  const id = normalizeSessionId(sessionId);
  if (!id) return { ok: false, reason: "session ID missing" };
  if (!SESSION_ID_PATTERN.test(id)) {
    return { ok: false, reason: "session ID malformed — expected RB-G9-YYYYMMDD-AP##" };
  }
  if (FORBIDDEN_SESSION_IDS.includes(id)) {
    return { ok: false, reason: "session ID references closed historical session" };
  }
  return { ok: true, sessionId: id };
}

function validateBaselineHash(hash) {
  const value = String(hash || "").trim().toLowerCase();
  if (!value) return { ok: false, reason: "arming baseline hash missing" };
  if (!SHA256_HEX_PATTERN.test(value)) {
    return { ok: false, reason: "arming baseline hash malformed — expected 64-char SHA-256 hex" };
  }
  if (/^0+$/.test(value) || value === "deadbeef") {
    return { ok: false, reason: "arming baseline hash placeholder rejected" };
  }
  return { ok: true, armingBaselineHash: value };
}

function assertNotHistoricalPath(filePath) {
  const normalized = String(filePath || "");
  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (normalized.includes(marker)) {
      throw new Error(`historical authorization path rejected: ${path.basename(normalized)}`);
    }
  }
}

function readAuthorizationDocumentMetadata(filePath) {
  if (!filePath) {
    return { present: false, readable: false, signed: false, consumed: false, documentClass: null };
  }
  assertNotHistoricalPath(filePath);
  if (!fs.existsSync(filePath)) {
    return { present: false, readable: false, signed: false, consumed: false, documentClass: null, path: filePath };
  }
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return { present: true, readable: false, signed: false, consumed: false, documentClass: null, path: filePath };
  }
  const sessionIds = [];
  const sessionMatches = text.match(/RB-G9-\d{8}-[A-Z0-9]+/g) || [];
  for (const id of sessionMatches) {
    if (!sessionIds.includes(id)) sessionIds.push(id);
  }
  const signed = /\*\*SIGNED\b/i.test(text)
    || /\*\*APPROVED\*\*/i.test(text)
    || /Signed 2026|Signature date:\s*\*\*2026/i.test(text);
  const consumed = /CONSUMED\/CLOSED|do not reuse|ABORTED_BEFORE_BROADCAST|NO_TRADE_EXECUTED/i.test(text);
  const documentClass = classifyAuthorizationDocument(text);
  const prohibitionsPresent = G4_REQUIRED_PROHIBITIONS.every(term =>
    new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)
  );
  return {
    present: true,
    readable: true,
    signed,
    consumed,
    documentClass,
    sessionIds,
    prohibitionsPresent,
    fingerprintSha256: common.hashFile(filePath),
    basename: path.basename(filePath),
    path: filePath
  };
}

function classifyAuthorizationDocument(text) {
  const body = String(text || "");
  if (/Micro-Live Execution/i.test(body)) return "micro-live-execution";
  if (/Armed No-Submit Proof/i.test(body)) return "armed-no-submit-proof";
  if (/Runtime R15 Approval Stub Creation|Stub Creation/i.test(body)) return "stub-creation";
  if (/AUTHORIZATION — Arming|Arming Authorization/i.test(body)) return "arming";
  if (/R15 ENGINEERING-VALIDATION|R15 Session Authorization/i.test(body)) return "fresh-r15";
  return "unknown";
}

function expectedClassForKey(key) {
  switch (key) {
    case "g1": return "fresh-r15";
    case "g2": return "arming";
    case "g3": return "stub-creation";
    case "g4": return "armed-no-submit-proof";
    default: return null;
  }
}

function loadSessionManifest(manifestPath, root = process.cwd()) {
  const abs = path.isAbsolute(manifestPath) ? manifestPath : path.join(root, manifestPath);
  const data = common.safeLoadJson(abs, null);
  if (!data || typeof data !== "object") {
    throw new Error("session manifest unreadable or invalid JSON");
  }
  const sessionId = normalizeSessionId(data.sessionId);
  const authorizations = data.authorizations || data.auth || {};
  return {
    sessionId,
    proofContext: data.proofContext || PROOF_CONTEXT,
    documents: {
      g1: authorizations.g1 || authorizations.r15 || null,
      g2: authorizations.g2 || authorizations.arming || null,
      g3: authorizations.g3 || authorizations.stubCreation || null,
      g4: authorizations.g4 || authorizations.armedNoSubmitProof || null
    }
  };
}

function resolveAuthorizationDocuments(options = {}, root = process.cwd()) {
  const docs = { g1: null, g2: null, g3: null, g4: null };
  if (options.sessionManifest) {
    const manifest = loadSessionManifest(options.sessionManifest, root);
    for (const key of Object.keys(docs)) {
      docs[key] = manifest.documents[key] || null;
    }
    if (!options.sessionId) options.sessionId = manifest.sessionId;
    if (!options.proofContext) options.proofContext = manifest.proofContext;
  }
  if (options.authPaths) {
    for (const key of Object.keys(docs)) {
      if (options.authPaths[key]) docs[key] = options.authPaths[key];
    }
  }
  for (const key of Object.keys(docs)) {
    if (!docs[key]) continue;
    docs[key] = path.isAbsolute(docs[key]) ? docs[key] : path.join(root, docs[key]);
    assertNotHistoricalPath(docs[key]);
  }
  return docs;
}

function detectAuthorizationChainMode(documents) {
  if (!documents || typeof documents !== "object") return "unconfigured";
  if (documents.g1 || documents.g4 || documents.armedNoSubmitProof) return "armed-no-submit-proof";
  if (documents.microLive) return "micro-live";
  if (documents.r15 && documents.arming && documents.stubCreation) return "micro-live";
  return "unconfigured";
}

function validateProofAuthorizationChain(documents, sessionId) {
  const errors = [];
  const metadata = {};
  const requiredKeys = ["g1", "g2", "g3", "g4"];
  const seenPaths = new Set();

  for (const key of requiredKeys) {
    const filePath = documents[key];
    if (!filePath) {
      errors.push(`missing ${key.toUpperCase()} authorization document`);
      continue;
    }
    if (seenPaths.has(filePath)) {
      errors.push(`duplicate authorization document path for ${key}`);
    }
    seenPaths.add(filePath);
    const meta = readAuthorizationDocumentMetadata(filePath);
    metadata[key] = meta;
    const expectedClass = expectedClassForKey(key);
    if (!meta.present || !meta.readable) {
      errors.push(`${key.toUpperCase()} authorization unreadable or absent`);
      continue;
    }
    if (!meta.signed) errors.push(`${key.toUpperCase()} authorization unsigned`);
    if (meta.consumed) errors.push(`${key.toUpperCase()} authorization consumed or closed`);
    if (meta.documentClass !== expectedClass) {
      errors.push(`${key.toUpperCase()} authorization wrong document type (${meta.documentClass || "unknown"})`);
    }
    if (key === "g4") {
      if (G4_MICRO_LIVE_MARKERS.some(marker => fs.readFileSync(filePath, "utf8").includes(marker))
        && !G4_PROOF_MARKERS.some(marker => fs.readFileSync(filePath, "utf8").includes(marker))) {
        errors.push("G4 Micro-Live Execution Authorization cannot satisfy proof G4");
      }
      if (!meta.prohibitionsPresent) {
        errors.push("G4 authorization missing required no-execution prohibitions");
      }
    }
    if (sessionId && meta.sessionIds.length > 0) {
      const mismatched = meta.sessionIds.filter(id => id !== sessionId);
      if (mismatched.length > 0) errors.push(`${key.toUpperCase()} authorization session mismatch`);
      if (!meta.sessionIds.includes(sessionId)) {
        errors.push(`${key.toUpperCase()} authorization does not bind session ${sessionId}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, metadata };
}

function validateProofDayG1ForSession(options = {}) {
  const {
    documents,
    sessionId,
    proofDayLocal,
    timezone,
    operatingBlockStartUtc,
    operatingBlockEndUtc,
    consumedRegistry = []
  } = options;
  if (!documents?.g1) {
    return { ok: false, reasonCode: g1ProofDay.G1_REASON_CODES.G1_UNREADABLE };
  }
  return g1ProofDay.validateProofDayG1({
    g1Path: documents.g1,
    sessionId,
    proofDayLocal,
    timezone: timezone || g1ProofDay.DEFAULT_TIMEZONE,
    operatingBlockStartUtc,
    operatingBlockEndUtc,
    consumedRegistry
  });
}

function validateMicroLiveAuthorizationChain(documents, sessionId) {
  const mapping = {
    r15: "fresh-r15",
    arming: "arming",
    stubCreation: "stub-creation",
    microLive: "micro-live-execution"
  };
  const errors = [];
  const metadata = {};
  for (const [key, expectedClass] of Object.entries(mapping)) {
    const filePath = documents[key];
    if (!filePath) {
      errors.push(`missing ${key} authorization document`);
      continue;
    }
    const meta = readAuthorizationDocumentMetadata(filePath);
    metadata[key] = meta;
    if (!meta.present || !meta.readable) errors.push(`${key} authorization unreadable`);
    else if (!meta.signed) errors.push(`${key} authorization unsigned`);
    else if (meta.consumed) errors.push(`${key} authorization consumed or closed`);
    else if (meta.documentClass !== expectedClass && meta.documentClass !== "unknown") {
      errors.push(`${key} authorization wrong document type`);
    }
    if (sessionId && meta.sessionIds?.length && !meta.sessionIds.includes(sessionId)) {
      errors.push(`${key} authorization session mismatch`);
    }
  }
  const allPresent = Object.keys(mapping).every(k => metadata[k]?.present && metadata[k]?.readable);
  const allSigned = Object.values(metadata).every(m => !m.present || m.signed);
  if (allPresent && allSigned && sessionId && errors.length === 0) {
    return { ok: true, errors: [], metadata };
  }
  if (errors.length === 0 && (!sessionId || !allPresent || !allSigned)) {
    errors.push("micro-live authorization chain incomplete or unsigned");
  }
  return { ok: errors.length === 0, errors, metadata };
}

function buildProofScopeReplacementEvidence(adapters, cfg) {
  const packet = adapters.sessionId ? adapters.candidatePacket(adapters.sessionId) : null;
  const quoteMeta = adapters.getExecutionQuoteMetadata?.() || null;
  const tradeMeta = adapters.getTradeMetadata?.() || null;
  const executionPathCallCount = adapters.executionPathCallCount ?? 0;
  const positionSizeSol = Number(cfg?.positionSizeSol);
  const maxSlippageBps = Number(cfg?.maxEntrySlippagePct) * 100;
  const scalingDisabled = cfg?.compoundingEnabled === false
    && cfg?.averagingDownEnabled === false
    && cfg?.martingaleEnabled === false;

  const hasCandidate = !!(packet && (packet.mint || packet.tokenMint) && packet.proofScopeOnly !== true);
  const hasQuote = !!(quoteMeta && (quoteMeta.requestedForExecution || quoteMeta.executionQuote));
  const hasTrade = !!(tradeMeta && (tradeMeta.tradeId || tradeMeta.side || tradeMeta.intent));

  return {
    replacementEvidenceId: AP15_REPLACEMENT_ID,
    noCandidateSelected: !hasCandidate,
    noExecutionQuoteRequested: !hasQuote,
    noTradeMetadataPresent: !hasTrade,
    positionSizeSolCap: 0.005,
    positionSizeSolConfigured: positionSizeSol,
    positionSizeCapUnchanged: Number.isFinite(positionSizeSol) && positionSizeSol <= 0.005,
    maxSlippageBps: 100,
    maxSlippageBpsConfigured: maxSlippageBps,
    slippageCapUnchanged: Number.isFinite(maxSlippageBps) && maxSlippageBps <= 100,
    automationCandidateHandoffDisabled: adapters.automationCandidateHandoffDisabled !== false,
    scalingDisabled,
    runtimeStubPurpose: adapters.runtimeStubPurpose || "armed_no_submit_proof_only",
    proofAuthorizationProhibitsExecution: adapters.proofAuthorizationProhibitsExecution !== false,
    executionPathCallCount
  };
}

function validateProofScopeReplacementEvidence(evidence) {
  const errors = [];
  const requiredBooleans = [
    "noCandidateSelected",
    "noExecutionQuoteRequested",
    "noTradeMetadataPresent",
    "positionSizeCapUnchanged",
    "slippageCapUnchanged",
    "automationCandidateHandoffDisabled",
    "scalingDisabled",
    "proofAuthorizationProhibitsExecution"
  ];
  for (const key of requiredBooleans) {
    if (evidence[key] !== true) errors.push(`AP-15 replacement evidence ${key} not satisfied`);
  }
  if (evidence.replacementEvidenceId !== AP15_REPLACEMENT_ID) {
    errors.push("AP-15 replacement evidence ID mismatch");
  }
  if (evidence.runtimeStubPurpose !== "armed_no_submit_proof_only") {
    errors.push("AP-15 runtime stub purpose mismatch");
  }
  if (evidence.executionPathCallCount !== 0) {
    errors.push("AP-15 execution path calls detected");
  }
  return { ok: errors.length === 0, errors };
}

function parseArmedPreflightCli(argv = process.argv.slice(2)) {
  const getValue = flag => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : null;
  };

  const parsed = {
    jsonOut: argv.includes("--json"),
    outPath: getValue("--out"),
    sessionId: getValue("--session-id"),
    armingBaselineHash: getValue("--arming-baseline-hash"),
    sessionManifest: getValue("--session-manifest"),
    authPaths: {
      g1: getValue("--auth-g1"),
      g2: getValue("--auth-g2"),
      g3: getValue("--auth-g3"),
      g4: getValue("--auth-g4")
    },
    errors: [],
    wantsProofInputs: false,
    cliInputsEcho: {}
  };

  parsed.wantsProofInputs = !!(
    parsed.sessionId
    || parsed.armingBaselineHash
    || parsed.sessionManifest
    || Object.values(parsed.authPaths).some(Boolean)
  );

  if (!parsed.wantsProofInputs) {
    return { ok: true, ...parsed };
  }

  const sessionCheck = validateSessionId(parsed.sessionId);
  if (!sessionCheck.ok) parsed.errors.push(sessionCheck.reason);

  const hashCheck = validateBaselineHash(parsed.armingBaselineHash);
  if (!hashCheck.ok) parsed.errors.push(hashCheck.reason);

  const explicitAuthCount = Object.values(parsed.authPaths).filter(Boolean).length;
  if (!parsed.sessionManifest && explicitAuthCount !== 4) {
    parsed.errors.push("exactly four explicit authorization paths or one session manifest required");
  }
  if (parsed.sessionManifest && explicitAuthCount > 0) {
    parsed.errors.push("session manifest and explicit authorization paths are mutually exclusive");
  }

  if (parsed.errors.length > 0) {
    return { ok: false, ...parsed };
  }

  parsed.cliInputsEcho = {
    sessionId: sessionCheck.sessionId,
    armingBaselineHash: hashCheck.armingBaselineHash,
    sessionManifest: parsed.sessionManifest ? path.basename(parsed.sessionManifest) : null,
    authorizationDocumentCount: parsed.sessionManifest ? 4 : explicitAuthCount,
    proofContext: PROOF_CONTEXT
  };

  return {
    ok: true,
    sessionId: sessionCheck.sessionId,
    armingBaselineHash: hashCheck.armingBaselineHash,
    proofContext: PROOF_CONTEXT,
    ...parsed
  };
}

function buildSessionLinkageFromOptions(options = {}, root = process.cwd()) {
  if (!options.sessionId && !options.sessionManifest && !options.authPaths) return null;

  const sessionCheck = validateSessionId(options.sessionId);
  if (!sessionCheck.ok) throw new Error(sessionCheck.reason);

  const documents = resolveAuthorizationDocuments(options, root);
  const chainValidation = validateProofAuthorizationChain(documents, sessionCheck.sessionId);
  if (!chainValidation.ok) {
    throw new Error(chainValidation.errors.join("; "));
  }

  return {
    sessionId: sessionCheck.sessionId,
    armingBaselineHash: options.armingBaselineHash
      ? validateBaselineHash(options.armingBaselineHash).armingBaselineHash
      : null,
    proofContext: options.proofContext || PROOF_CONTEXT,
    authorizationChainMode: "armed-no-submit-proof",
    documents,
    authorizationMetadata: chainValidation.metadata
  };
}

function applySessionLinkage(adapters, linkage) {
  if (!linkage) return adapters;
  adapters.sessionId = linkage.sessionId;
  adapters.armingBaselineHash = linkage.armingBaselineHash || adapters.armingBaselineHash;
  adapters.proofContext = linkage.proofContext || PROOF_CONTEXT;
  adapters.authorizationChainMode = linkage.authorizationChainMode || "armed-no-submit-proof";
  adapters.sessionLinkage = linkage;
  adapters.proofAuthorizationProhibitsExecution = true;
  adapters.automationCandidateHandoffDisabled = true;
  adapters.runtimeStubPurpose = "armed_no_submit_proof_only";
  adapters.executionPathCallCount = adapters.executionPathCallCount ?? 0;
  adapters.authorizationDocs = () => linkage.documents;
  return adapters;
}

function authorizationMetadataFingerprints(metadata = {}) {
  const out = {};
  for (const [key, meta] of Object.entries(metadata)) {
    out[key] = {
      basename: meta.basename || null,
      fingerprintSha256: meta.fingerprintSha256 || null,
      documentClass: meta.documentClass || null,
      signed: !!meta.signed,
      consumed: !!meta.consumed
    };
  }
  return out;
}

module.exports = {
  SESSION_ID_PATTERN,
  SHA256_HEX_PATTERN,
  PROOF_CONTEXT,
  AP15_REPLACEMENT_ID,
  FORBIDDEN_SESSION_IDS,
  validateSessionId,
  validateBaselineHash,
  readAuthorizationDocumentMetadata,
  classifyAuthorizationDocument,
  loadSessionManifest,
  resolveAuthorizationDocuments,
  detectAuthorizationChainMode,
  validateProofAuthorizationChain,
  validateProofDayG1ForSession,
  validateMicroLiveAuthorizationChain,
  buildProofScopeReplacementEvidence,
  validateProofScopeReplacementEvidence,
  parseArmedPreflightCli,
  buildSessionLinkageFromOptions,
  applySessionLinkage,
  authorizationMetadataFingerprints
};
