"use strict";

const MANIFEST_VERSION = "ap-manifest/1.0.0";

const AP_ORDER = Object.freeze([
  "AP-01",
  "AP-02",
  "AP-03",
  "AP-04",
  "AP-05",
  "AP-06",
  "AP-07",
  "AP-08",
  "AP-09",
  "AP-10",
  "AP-11",
  "AP-12",
  "AP-13",
  "AP-14",
  "AP-15",
  "AP-16",
  "AP-17",
  "AP-18",
  "AP-19",
  "AP-20"
]);

const AP_DEFINITIONS = Object.freeze({
  "AP-01": {
    id: "AP-01",
    label: "Production posture LIVE_ARMED",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-02": {
    id: "AP-02",
    label: "Signed authorization chain valid",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-03": {
    id: "AP-03",
    label: "Runtime R15 stub present and session-bound",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-04": {
    id: "AP-04",
    label: "Executor loop count zero",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-05": {
    id: "AP-05",
    label: "Singleton lock state documented",
    securityOrdered: false,
    replacementFor: null
  },
  "AP-06": {
    id: "AP-06",
    label: "Open live positions zero",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-07": {
    id: "AP-07",
    label: "Pending reconciliation zero",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-08": {
    id: "AP-08",
    label: "Recovery actions none or documented",
    securityOrdered: false,
    replacementFor: null
  },
  "AP-09": {
    id: "AP-09",
    label: "Capital exposure none",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-10": {
    id: "AP-10",
    label: "Signer present and wallet public match",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-11": {
    id: "AP-11",
    label: "Dedicated RPC read-only health",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-12": {
    id: "AP-12",
    label: "Live submission gate failures all pass",
    securityOrdered: true,
    replacementFor: "validate_live_system arming structure checks"
  },
  "AP-13": {
    id: "AP-13",
    label: "R15 approval record assert pass",
    securityOrdered: true,
    replacementFor: null
  },
  "AP-14": {
    id: "AP-14",
    label: "BUY no-submit guard probe pass",
    securityOrdered: true,
    replacementFor: "test_pipeline_dry_run / candidate handoff dry branch"
  },
  "AP-15": {
    id: "AP-15",
    label: "Candidate packet bounds",
    securityOrdered: false,
    replacementFor: null
  },
  "AP-16": {
    id: "AP-16",
    label: "Jupiter adapter read-only probe",
    securityOrdered: false,
    replacementFor: "partial dry Jupiter static checks"
  },
  "AP-17": {
    id: "AP-17",
    label: "N6 armed-safe e-stop probe",
    securityOrdered: true,
    replacementFor: "test_n6_estop_drill.js full E0-E10"
  },
  "AP-18": {
    id: "AP-18",
    label: "Config hash vs arming baseline",
    securityOrdered: false,
    replacementFor: null
  },
  "AP-19": {
    id: "AP-19",
    label: "OR-20260630-008 not_promoted",
    securityOrdered: false,
    replacementFor: null
  },
  "AP-20": {
    id: "AP-20",
    label: "R16 live path coupling mocked evidence",
    securityOrdered: false,
    replacementFor: null
  }
});

const DRY_ONLY_REPLACEMENTS = Object.freeze({
  "validate_live_system.dryRunMode": "AP-01",
  "validate_live_system.executionModeNonLive": "AP-01",
  "test_n6_estop_drill.full": "AP-17",
  "test_pipeline_dry_run": "AP-12,AP-14",
  "test_pipeline_candidate_handoff.dry": "AP-14"
});

function validateManifestResults(results) {
  const errors = [];
  const seen = new Set();
  const byId = new Map();

  for (const result of results) {
    if (!result || typeof result !== "object") {
      errors.push("result entry missing or not an object");
      continue;
    }
    const id = result.checkId;
    if (!AP_DEFINITIONS[id]) {
      errors.push(`unknown check ${id}`);
      continue;
    }
    if (seen.has(id)) errors.push(`duplicate check ${id}`);
    seen.add(id);
    byId.set(id, result);

    if (!result.status) errors.push(`${id} missing status`);
    if (!result.rationale) errors.push(`${id} missing rationale`);
    if (!result.evidence || typeof result.evidence !== "object") errors.push(`${id} missing evidence`);
    if (result.status === "SKIP") errors.push(`${id} SKIP forbidden`);
    if (result.status === "NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE") {
      const replacement = result.evidence?.replacementCheckId || result.evidence?.replacementEvidenceId;
      if (!replacement) errors.push(`${id} missing replacement evidence`);
    }
  }

  for (const id of AP_ORDER) {
    if (!seen.has(id)) errors.push(`missing mandatory check ${id}`);
  }

  const orderedIds = results.map(r => r?.checkId).filter(Boolean);
  const securityIds = AP_ORDER.filter(id => AP_DEFINITIONS[id].securityOrdered);
  let securityIndex = 0;
  for (const id of orderedIds) {
    if (!AP_DEFINITIONS[id]?.securityOrdered) continue;
    if (id !== securityIds[securityIndex]) {
      errors.push(`security-relevant ordering violation at ${id}`);
      break;
    }
    securityIndex++;
  }

  return { ok: errors.length === 0, errors, byId };
}

function aggregateOverallStatus(results) {
  const validation = validateManifestResults(results);
  if (!validation.ok) return { overallStatus: "FAIL", validation };

  for (const result of results) {
    if (result.status === "FAIL") {
      return { overallStatus: "FAIL", validation };
    }
  }
  return { overallStatus: "PASS", validation };
}

module.exports = {
  MANIFEST_VERSION,
  AP_ORDER,
  AP_DEFINITIONS,
  DRY_ONLY_REPLACEMENTS,
  validateManifestResults,
  aggregateOverallStatus
};
