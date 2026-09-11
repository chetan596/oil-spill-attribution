const { Router } = require('express');
const reportController = require('../controllers/report.controller');
const router = Router();

router.post('/generate/:spillId', reportController.generateReport);

module.exports = router;
