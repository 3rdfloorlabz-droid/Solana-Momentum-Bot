"use strict";

// recovery_routes.js — Sprint 4 A2s
// Registers authenticated low-risk recovery plan/confirm routes on the dashboard app.

const { planRecoveryAction, confirmRecoveryAction } = require("./recovery_service");

function registerRecoveryRoutes(app, deps) {
  if (!deps || typeof deps.requireDashboardControlAuth !== "function") {
    throw new Error("registerRecoveryRoutes requires requireDashboardControlAuth");
  }
  if (typeof deps.getPosture !== "function" || typeof deps.getTargetState !== "function") {
    throw new Error("registerRecoveryRoutes requires getPosture and getTargetState");
  }

  app.post("/recovery/plan/:actionId", (req, res) => {
    if (!deps.requireDashboardControlAuth(req, res)) return;
    const out = planRecoveryAction({
      actionId: req.params.actionId,
      body: req.body || {},
      query: req.query || {},
      posture: deps.getPosture(),
      getTargetState: deps.getTargetState,
      sourceIpOrHost: req.ip || "127.0.0.1",
      auditAppend: deps.auditAppend
    });
    res.status(out.httpStatus).json(out.payload);
  });

  app.post("/recovery/confirm/:actionId", (req, res) => {
    if (!deps.requireDashboardControlAuth(req, res)) return;
    const out = confirmRecoveryAction({
      actionId: req.params.actionId,
      body: req.body || {},
      query: req.query || {},
      posture: deps.getPosture(),
      getTargetState: deps.getTargetState,
      sourceIpOrHost: req.ip || "127.0.0.1",
      auditAppend: deps.auditAppend
    });
    res.status(out.httpStatus).json(out.payload);
  });
}

module.exports = {
  registerRecoveryRoutes
};
