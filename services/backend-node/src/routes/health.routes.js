const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    service: "oil-spill-attribution-api",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;