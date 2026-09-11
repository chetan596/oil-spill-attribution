class SpillService {
  async getSpillDetails(id) {
    return { id, status: 'active' };
  }
}

module.exports = new SpillService();
