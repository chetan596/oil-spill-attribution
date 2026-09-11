const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const jobsRoutes = require('./jobs.routes');
const spillsRoutes = require('./spills.routes');
const vesselsRoutes = require('./vessels.routes');
const reportsRoutes = require('./reports.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/jobs', jobsRoutes);
router.use('/spills', spillsRoutes);
router.use('/vessels', vesselsRoutes);
router.use('/reports', reportsRoutes);

module.exports = router;
