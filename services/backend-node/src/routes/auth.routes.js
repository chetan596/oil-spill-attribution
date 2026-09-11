const { Router } = require('express');
const router = Router();

router.post('/login', (req, res) => {
  res.json({ token: 'mock-jwt-token', user: { id: 1, role: 'analyst' } });
});

module.exports = router;
