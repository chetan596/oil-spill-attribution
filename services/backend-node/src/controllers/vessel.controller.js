exports.listVessels = async (req, res, next) => {
  try {
    res.json({ data: [] });
  } catch (err) { next(err); }
};

exports.getAttribution = async (req, res, next) => {
  try {
    res.json({ spillId: req.params.spillId, candidates: [] });
  } catch (err) { next(err); }
};
