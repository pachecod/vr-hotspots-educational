const {
  loginRateLimiter,
  handleStudentLogin,
  handleStudentLogout,
  handleStudentSessionStatus,
  requireStudentStrict,
  getStudentSession,
} = require('../student-auth');
const { query, isDbEnabled } = require('../services/db-service');
const { hasClassHostedGalleryProjects } = require('../services/hosted-projects-gallery');

function registerStudentRoutes(app) {
  app.post('/api/student/login', loginRateLimiter, handleStudentLogin);
  app.post('/api/student/logout', handleStudentLogout);
  app.get('/api/student/session', handleStudentSessionStatus);

  app.get('/api/student/class-hosted-gallery', requireStudentStrict, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.json({ show: false });
      }
      const sess = getStudentSession(req);
      const { rows } = await query(
        `SELECT s.id, s.class_id, c.slug
         FROM students s
         JOIN classes c ON c.id = s.class_id
         WHERE s.id = $1 AND s.is_active = TRUE`,
        [sess.studentId]
      );
      if (!rows.length || !rows[0].slug) {
        return res.json({ show: false });
      }
      const { class_id: classId, slug } = rows[0];
      const show = await hasClassHostedGalleryProjects(classId);
      if (!show) {
        return res.json({ show: false });
      }
      return res.json({
        show: true,
        url: `/${encodeURIComponent(slug)}/hosted-projects.html`,
      });
    } catch (err) {
      console.error('class-hosted-gallery promo error:', err);
      return res.json({ show: false });
    }
  });
}

module.exports = { registerStudentRoutes };
