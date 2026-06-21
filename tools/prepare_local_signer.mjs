#!/usr/bin/env node

/*
 * Developer utility only.
 * Local signer setup and validation helper for FOMO Engine 01.
 *
 * This script is not part of the live executor path.
 * It must never submit transactions, never enable LIVE mode, never change
 * live_config.json, and never print private key material or signer arrays.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Keypair } from "@solana/web3.js";

const PROJECT_ROOT = path.resolve("C:\\Users\\nalle\\sol-momentum-bot");
const CONFIG_PATH = path.join(PROJECT_ROOT, "live_config.json");
const TARGET_PUBLIC_KEY = "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6";
const PRIVATE_KEY_INPUT_PATH = "C:\\Users\\nalle\\fomo-secrets\\fomo-private-key.txt";
const OUTPUT_KEYPAIR_PATH = "C:\\Users\\nalle\\fomo-secrets\\fomo-keypair.json";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map([...BASE58_ALPHABET].map((char, index) => [char, index]));

function fail(message) {
  console.error(`STOP: ${message}`);
  process.exitCode = 1;
}

function printHelp() {
  console.log(`
Usage:
  node .\\tools\\prepare_local_signer.mjs

Safety:
  - Reads Phantom base58 private key from:
    ${PRIVATE_KEY_INPUT_PATH}
  - Writes SOLANA_SIGNER_SECRET-compatible 64-byte JSON array to:
    ${OUTPUT_KEYPAIR_PATH}
  - Prints only derived public key, target match, and byte-count validation.
  - Does not print private key input or output signer array.
`);
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function assertSafeState(cfg) {
  if (cfg.executionMode !== "PIPELINE_DRY_RUN") {
    throw new Error(`executionMode must be PIPELINE_DRY_RUN; current value is ${String(cfg.executionMode)}`);
  }
  if (cfg.dryRunMode !== true) {
    throw new Error(`dryRunMode must be true; current value is ${String(cfg.dryRunMode)}`);
  }
  if (process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES") {
    throw new Error("FOMO_ENABLE_LIVE_SUBMISSION is YES; refusing signer preparation.");
  }
}

function decodeBase58(value) {
  const input = String(value || "").trim();
  if (!input) {
    throw new Error("Private key input is empty.");
  }

  let decoded = [0];
  for (const char of input) {
    const digit = BASE58_MAP.get(char);
    if (digit === undefined) {
      throw new Error("Private key is not valid base58.");
    }

    let carry = digit;
    for (let i = 0; i < decoded.length; i += 1) {
      const next = decoded[i] * 58 + carry;
      decoded[i] = next & 0xff;
      carry = next >> 8;
    }

    while (carry > 0) {
      decoded.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of input) {
    if (char === "1") {
      decoded.push(0);
    } else {
      break;
    }
  }

  return Uint8Array.from(decoded.reverse());
}

function readPrivateKey() {
  if (!fs.existsSync(PRIVATE_KEY_INPUT_PATH)) {
    throw new Error(`Private key file is missing: ${PRIVATE_KEY_INPUT_PATH}`);
  }
  return fs.readFileSync(PRIVATE_KEY_INPUT_PATH, "utf8").trim();
}

function ensureOutputPath(outputFile) {
  const resolved = path.resolve(outputFile);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  return resolved;
}

function writeJsonArrayAtomically(outputFile, bytes) {
  const payload = JSON.stringify(Array.from(bytes));
  const resolved = ensureOutputPath(outputFile);
  const temp = `${resolved}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, payload, { encoding: "utf8", flag: "wx", mode: 0o600 });
  fs.renameSync(temp, resolved);
  return resolved;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  if (args.length > 0) {
    throw new Error("This utility does not accept arguments. Use the fixed local secret paths documented in the script.");
  }

  const cfg = loadConfig();
  assertSafeState(cfg);

  const privateKeyBase58 = readPrivateKey();
  const secretBytes = decodeBase58(privateKeyBase58);

  if (secretBytes.length !== 64) {
    throw new Error(`Decoded Phantom private key must be 64 bytes; decoded length was ${secretBytes.length}.`);
  }

  const keypair = Keypair.fromSecretKey(secretBytes);
  const derivedPublicKey = keypair.publicKey.toBase58();
  const matchesTarget = derivedPublicKey === TARGET_PUBLIC_KEY;

  if (!matchesTarget) {
    console.log(`Derived public key: ${derivedPublicKey}`);
    console.log(`Matches target ${TARGET_PUBLIC_KEY}: no`);
    console.log(`Output keypair has 64 bytes: ${secretBytes.length === 64 ? "yes" : "no"}`);
    throw new Error("Derived public key does not match target wallet. No output file was written.");
  }

  const outputPath = writeJsonArrayAtomically(OUTPUT_KEYPAIR_PATH, secretBytes);

  console.log(`Derived public key: ${derivedPublicKey}`);
  console.log(`Matches target ${TARGET_PUBLIC_KEY}: yes`);
  console.log(`Output keypair has 64 bytes: yes`);
  console.log(`Wrote signer JSON array to: ${outputPath}`);
  console.log("Private key material was not printed.");
}

main().catch((error) => {
  fail(error?.message || String(error));
});
