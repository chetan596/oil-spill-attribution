class AuthService {
  async authenticate(email, password) {
    return { token: 'sample_token', userId: 1 };
  }
}
module.exports = new AuthService();
