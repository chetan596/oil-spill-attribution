exports.listSpills = async (req, res, next) => {
  try {
    res.json({ data: [] });
  } catch (err) { next(err); }
};

exports.getSpillById = async (req, res, next) => {
  try {
    res.json({ id: req.params.id, title: 'Sample Slick', areaKm2: 4.2 });
  } catch (err) { next(err); }
};
