const express = require("express");

const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes");
const jobsRoutes = require("./jobs.routes");
const spillsRoutes = require("./spills.routes");
const vesselsRoutes = require("./vessels.routes");
const attributionRoutes = require("./attribution.routes");
const reportsRoutes = require("./reports.routes");
const dossierRoutes = require("./dossier.routes");
const scenesRoutes = require("./scenes.routes");
const sentinel1Routes = require("./sentinel1.routes");
const realScenesRoutes = require("./real-scenes.routes");
const manualAnalysisRoutes = require("../manual-analysis/manual-analysis.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/jobs", jobsRoutes);
router.use("/spills", spillsRoutes);
router.use("/vessels", vesselsRoutes);
router.use("/attribution", attributionRoutes);
router.use("/reports", reportsRoutes);
router.use("/dossier", dossierRoutes);
router.use("/scenes", scenesRoutes);
router.use("/sentinel1", sentinel1Routes);
router.use("/real-scenes", realScenesRoutes);
router.use("/manual-analysis", manualAnalysisRoutes);

module.exports = router;