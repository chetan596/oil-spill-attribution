const { Router } = require('express');
const jobController = require('../controllers/job.controller');
const router = Router();

router.post('/', jobController.createJob);
router.get('/:id', jobController.getJobById);

module.exports = router;
