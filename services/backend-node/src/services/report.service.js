class ReportService {
  async createIncidentDossier(spillId, attributionResults) {
    return { dossierId: 'DOSSIER_' + spillId, generatedAt: new Date() };
  }
}

module.exports = new ReportService();
