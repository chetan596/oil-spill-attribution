const express = require("express");

const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes");
const jobsRoutes = require("./jobs.routes");
const spillsRoutes = require("./spills.routes");
const vesselsRoutes = require("./vessels.routes");
const attributionRoutes = require("./attribution.routes");
const reportsRoutes = require("./reports.routes");
const dossierRoutes = require("./dossier.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/jobs", jobsRoutes);
router.use("/spills", spillsRoutes);
router.use("/vessels", vesselsRoutes);
router.use("/attribution", attributionRoutes);
router.use("/reports", reportsRoutes);
router.use("/dossier", dossierRoutes);

module.exports = router;