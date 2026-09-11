class LLMProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  async complete(prompt) {
    return "Generated attribution explanation.";
  }
}
module.exports = LLMProvider;
