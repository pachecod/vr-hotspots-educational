const {
  isLocalTestUserModeAvailable,
  startLocalTestUser,
  endLocalTestUser,
} = require('../lib/local-test-user');

function registerLocalTestUserRoutes(app) {
  app.post('/api/local/test-user/start', (req, res) => {
    if (!isLocalTestUserModeAvailable()) {
      return res.status(404).json({ success: false, message: 'Local Test User mode is not available' });
    }
    startLocalTestUser(res);
    return res.json({ success: true, mode: 'local_test' });
  });

  app.post('/api/local/test-user/end', (req, res) => {
    endLocalTestUser(res);
    return res.json({ success: true });
  });
}

module.exports = { registerLocalTestUserRoutes };
