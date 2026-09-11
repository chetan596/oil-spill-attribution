exports.createJob = async (req, res, next) => {
  try {
    res.status(201).json({ jobId: 'job_' + Date.now(), status: 'QUEUED' });
  } catch (err) { next(err); }
};

exports.getJobById = async (req, res, next) => {
  try {
    res.json({ id: req.params.id, status: 'COMPLETED', progress: 100 });
  } catch (err) { next(err); }
};
