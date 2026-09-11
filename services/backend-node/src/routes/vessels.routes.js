const { Router } = require('express');
const vesselController = require('../controllers/vessel.controller');
const router = Router();

router.get('/', vesselController.listVessels);
router.get('/attribution/:spillId', vesselController.getAttribution);

module.exports = router;
