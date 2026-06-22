const {
  loginRateLimiter,
  handleStudentLogin,
  handleStudentLogout,
  handleStudentSessionStatus,
} = require('../student-auth');

function registerStudentRoutes(app) {
  app.post('/api/student/login', loginRateLimiter, handleStudentLogin);
  app.post('/api/student/logout', handleStudentLogout);
  app.get('/api/student/session', handleStudentSessionStatus);
}

module.exports = { registerStudentRoutes };
