const { Router } = require('express');
const spillController = require('../controllers/spill.controller');
const router = Router();

router.get('/', spillController.listSpills);
router.get('/:id', spillController.getSpillById);

module.exports = router;
