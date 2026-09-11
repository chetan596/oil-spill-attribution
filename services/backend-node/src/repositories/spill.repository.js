class SpillRepository {
  async findById(id) { return null; }
  async create(spillData) { return { id: 1, ...spillData }; }
}
module.exports = new SpillRepository();
