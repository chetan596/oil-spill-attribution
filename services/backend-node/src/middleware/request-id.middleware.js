module.exports = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || 'req_' + Date.now();
  res.setHeader('x-request-id', req.requestId);
  next();
};
