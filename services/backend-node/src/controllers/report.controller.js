exports.generateReport = async (req, res, next) => {
  try {
    res.json({ reportId: 'rep_' + Date.now(), url: '/reports/download/rep_1' });
  } catch (err) { next(err); }
};
