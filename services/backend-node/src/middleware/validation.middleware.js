module.exports = (schema) => (req, res, next) => {
  try {
    if (schema) schema.parse({ body: req.body, query: req.query, params: req.params });
    next();
  } catch (err) {
    res.status(400).json({ error: err.errors });
  }
};
