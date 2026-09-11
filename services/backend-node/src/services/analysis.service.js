class AnalysisService {
  async runAttributionPipeline(jobId, payload) {
    return { status: 'STARTED', jobId };
  }
}

module.exports = new AnalysisService();
