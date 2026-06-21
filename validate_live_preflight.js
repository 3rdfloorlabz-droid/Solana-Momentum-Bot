#!/usr/bin/env node

/*
 * FOMO Engine 01 - LIVE-only preflight validator.
 *
 * This script is intentionally separate from validate_live_system.js.
 * validate_live_system.js remains the normal Phase 1 dry-run safety validator.
 *
 * This preflight is only for the final approved LIVE flip. It never submits,
 * signs, broadcasts, changes config, or prints secret values.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "live_config.json");
const PENDING_RECONCILIATION_FILE = path.join(ROOT, "pending_reconciliation.jsonl");
const TARGET_FIRST_LIVE_POSITION_SIZE_SOL = 0.005;

const PUBLIC_SOLANA_RPC_HOSTNAMES = new Set([
  "api.mainnet-beta.solana.com",
  "api.devnet.solana.com",
  "api.testnet.solana.com",
  "solana.com",
  "www.solana.com"
]);

const checks = [];

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

function addCheck(label, ok, detail = "") {
  checks.push({ label, ok: ok === true, detail: String(detail || "") });
  const icon = ok ? "PASS" : "FAIL";
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ""}`);
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function safeJsonRead(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (error) {
    return { ok: false, error };
  }
}

function encodeBase58(bytes) {
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) {
    throw new Error("encodeBase58 requires bytes");
  }
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = (value * 256n) + BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    encoded = alphabet[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1;
  return "1".repeat(leadingZeros) + (encoded || (leadingZeros ? "" : "1"));
}

function deriveSignerPublicKeyFromEnv() {
  const raw = process.env.SOLANA_SIGNER_SECRET;
  if (!raw) {
    return { ok: false, reason: "missing" };
  }

  let secretBytes;
  try {
    secretBytes = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed JSON" };
  }

  if (!Array.isArray(secretBytes) ||
      secretBytes.length !== 64 ||
      !secretBytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return { ok: false, reason: "not a 64-byte JSON array" };
  }

  try {
    const seed = Buffer.from(secretBytes.slice(0, 32));
    const embeddedPublicKey = Buffer.from(secretBytes.slice(32));
    const privateDer = Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed
    ]);
    const privateKey = crypto.createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
    const publicDer = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" });
    const derivedPublicKeyBytes = Buffer.from(publicDer).subarray(-32);
    if (!derivedPublicKeyBytes.equals(embeddedPublicKey)) {
      return { ok: false, reason: "embedded public key mismatch" };
    }
    return { ok: true, publicKey: encodeBase58(derivedPublicKeyBytes) };
  } catch {
    return { ok: false, reason: "invalid Ed25519 keypair" };
  }
}

function isPublicSolanaRpcEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) return false;
  try {
    const hostname = new URL(endpoint.trim()).hostname.toLowerCase();
    if (PUBLIC_SOLANA_RPC_HOSTNAMES.has(hostname)) return true;
    if (hostname === "api.mainnet-beta.solana.com") return true;
    if (hostname.endsWith(".solana.com") && hostname.startsWith("api.")) return true;
    return false;
  } catch {
    return false;
  }
}

function redactEndpoint(endpoint) {
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|auth|signature/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return "[MALFORMED_ENDPOINT_REDACTED]";
  }
}

function configuredRpcCandidates() {
  return [
    ["HELIUS_RPC_URL", process.env.HELIUS_RPC_URL],
    ["SOLANA_RPC_URL", process.env.SOLANA_RPC_URL],
    ["RPC_URL", process.env.RPC_URL]
  ].filter(([, value]) => !!value);
}

function pendingReconciliationState() {
  if (!fs.existsSync(PENDING_RECONCILIATION_FILE)) {
    return { ok: true, state: "absent" };
  }
  const stats = fs.statSync(PENDING_RECONCILIATION_FILE);
  if (stats.size === 0) {
    return { ok: true, state: "empty" };
  }
  const content = fs.readFileSync(PENDING_RECONCILIATION_FILE, "utf8").trim();
  return { ok: content.length === 0, state: content.length === 0 ? "empty" : "non-empty" };
}

function main() {
  console.log("FOMO Engine 01 LIVE Preflight Validator");
  console.log("Secrets are never printed. This script does not submit, sign, broadcast, or change files.");

  section("Config");
  const configRead = safeJsonRead(CONFIG_FILE);
  addCheck("live_config.json is valid JSON", configRead.ok, configRead.ok ? "yes" : "parse failed");
  const cfg = configRead.ok ? configRead.value : {};

  addCheck("executionMode === LIVE", cfg.executionMode === "LIVE", String(cfg.executionMode));
  addCheck("dryRunMode === false", cfg.dryRunMode === false, String(cfg.dryRunMode));
  addCheck("positionSizeSol === 0.005", Number(cfg.positionSizeSol) === TARGET_FIRST_LIVE_POSITION_SIZE_SOL, String(cfg.positionSizeSol));
  addCheck("maxOpenTrades === 1", Number(cfg.maxOpenTrades) === 1, String(cfg.maxOpenTrades));
  addCheck("emergencyStop === false", cfg.emergencyStop === false, String(cfg.emergencyStop));
  addCheck("automationEnabled === true", cfg.automationEnabled === true, String(cfg.automationEnabled));
  addCheck("walletPublicAddress present", !!cfg.walletPublicAddress, cfg.walletPublicAddress || "missing");

  section("Environment");
  addCheck("FOMO_ENABLE_LIVE_SUBMISSION === YES", process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES", yesNo(process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES"));
  addCheck("SOLANA_SIGNER_SECRET present", !!process.env.SOLANA_SIGNER_SECRET, yesNo(!!process.env.SOLANA_SIGNER_SECRET));
  addCheck("EXPECTED_WALLET_PUBLIC_ADDRESS present", !!process.env.EXPECTED_WALLET_PUBLIC_ADDRESS, yesNo(!!process.env.EXPECTED_WALLET_PUBLIC_ADDRESS));

  section("Signer");
  const signer = deriveSignerPublicKeyFromEnv();
  addCheck("SOLANA_SIGNER_SECRET is valid 64-byte JSON array", signer.ok, signer.ok ? "yes" : signer.reason);
  if (signer.ok) {
    console.log(`Derived public key: ${signer.publicKey}`);
  }
  addCheck(
    "Derived signer matches EXPECTED_WALLET_PUBLIC_ADDRESS",
    signer.ok && signer.publicKey === process.env.EXPECTED_WALLET_PUBLIC_ADDRESS,
    signer.ok && process.env.EXPECTED_WALLET_PUBLIC_ADDRESS ? yesNo(signer.publicKey === process.env.EXPECTED_WALLET_PUBLIC_ADDRESS) : "not checkable"
  );
  addCheck(
    "Derived signer matches live_config walletPublicAddress",
    signer.ok && signer.publicKey === cfg.walletPublicAddress,
    signer.ok && cfg.walletPublicAddress ? yesNo(signer.publicKey === cfg.walletPublicAddress) : "not checkable"
  );

  section("Dedicated RPC");
  const rpcCandidates = configuredRpcCandidates();
  addCheck("Dedicated RPC env present", rpcCandidates.length > 0, rpcCandidates.map(([name]) => name).join(", ") || "none");
  const publicProviders = rpcCandidates.filter(([, endpoint]) => isPublicSolanaRpcEndpoint(endpoint)).map(([name]) => name);
  addCheck("Dedicated RPC is not public Solana RPC", rpcCandidates.length > 0 && publicProviders.length === 0, publicProviders.length ? `public: ${publicProviders.join(", ")}` : "yes");
  for (const [name, endpoint] of rpcCandidates) {
    console.log(`${name}: set, redacted endpoint: ${redactEndpoint(endpoint)}`);
  }

  section("Reconciliation / Emergency");
  const reconciliation = pendingReconciliationState();
  addCheck("pending_reconciliation.jsonl absent or empty", reconciliation.ok, reconciliation.state);
  addCheck("panic.ps1 exists", fs.existsSync(path.join(ROOT, "panic.ps1")), yesNo(fs.existsSync(path.join(ROOT, "panic.ps1"))));
  addCheck("reset_after_panic.ps1 exists", fs.existsSync(path.join(ROOT, "reset_after_panic.ps1")), yesNo(fs.existsSync(path.join(ROOT, "reset_after_panic.ps1"))));
  addCheck("RECONCILIATION_RUNBOOK.md exists", fs.existsSync(path.join(ROOT, "RECONCILIATION_RUNBOOK.md")), yesNo(fs.existsSync(path.join(ROOT, "RECONCILIATION_RUNBOOK.md"))));

  section("Result");
  const failures = checks.filter(check => !check.ok);
  if (failures.length > 0) {
    console.log(`LIVE PREFLIGHT FAILED — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }

  console.log("LIVE PREFLIGHT PASSED");
}

main();
