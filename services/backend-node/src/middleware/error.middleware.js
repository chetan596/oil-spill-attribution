module.exports = (err, req, res, next) => {
  console.error('[Error Middleware]:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500,
    },
  });
};
