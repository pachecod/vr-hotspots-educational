const { loginRateLimiter } = require('../student-auth');
const { isDbEnabled } = require('../services/db-service');
const {
  verifyClassPassword,
  hasClassRosterAccess,
  grantClassRosterAccess,
  clearClassRosterAccess,
} = require('../lib/class-roster-gate');
const {
  resolveClassBySlug,
  listClassHostedGalleryProjects,
  setHostedGalleryFeatured,
  featuredHostedPagesTitle,
} = require('../services/hosted-projects-gallery');

function registerHostedProjectsRoutes(app) {
  app.get('/api/classes/:classSlug/hosted-projects/gate', async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const cls = await resolveClassBySlug(req.params.classSlug);
      if (!cls) {
        return res.status(404).json({
          success: false,
          message: 'Class not found. Check the URL with your teacher or administrator.',
        });
      }
      if (!cls.password_hash) {
        return res.status(503).json({
          success: false,
          message: `The "${cls.name}" class needs a password before this gallery can be used.`,
        });
      }
      return res.json({
        success: true,
        class: {
          id: cls.id,
          name: cls.name,
          slug: cls.slug,
          description: cls.description,
        },
        pageTitle: featuredHostedPagesTitle(cls.name),
        authenticated: hasClassRosterAccess(req, cls.id),
      });
    } catch (err) {
      console.error('hosted-projects gate error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.post('/api/classes/:classSlug/hosted-projects/verify-password', loginRateLimiter, async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const cls = await resolveClassBySlug(req.params.classSlug);
      if (!cls) {
        return res.status(404).json({ success: false, message: 'Class not found' });
      }
      const password = req.body && req.body.password;
      if (!password) {
        return res.status(400).json({ success: false, message: 'Password is required' });
      }
      const verification = await verifyClassPassword(cls.id, password);
      if (verification.reason === 'not_configured') {
        return res.status(503).json({
          success: false,
          message: 'This gallery is not configured with a password yet.',
        });
      }
      if (!verification.ok) {
        return res.status(401).json({ success: false, message: 'Incorrect password' });
      }
      grantClassRosterAccess(res, cls.id);
      return res.json({ success: true, classId: cls.id, classSlug: cls.slug });
    } catch (err) {
      console.error('hosted-projects verify error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.post('/api/classes/:classSlug/hosted-projects/lock', async (req, res) => {
    try {
      clearClassRosterAccess(res);
      return res.json({ success: true });
    } catch (err) {
      console.error('hosted-projects lock error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });

  app.get('/api/classes/:classSlug/hosted-projects/list', async (req, res) => {
    try {
      if (!isDbEnabled()) {
        return res.status(503).json({ success: false, message: 'Database not configured' });
      }
      const cls = await resolveClassBySlug(req.params.classSlug);
      if (!cls) {
        return res.status(404).json({ success: false, message: 'Class not found' });
      }
      if (!hasClassRosterAccess(req, cls.id)) {
        return res.status(401).json({ success: false, message: 'Password required' });
      }
      const projects = await listClassHostedGalleryProjects(cls.id);
      return res.json({
        success: true,
        className: cls.name,
        classSlug: cls.slug,
        pageTitle: featuredHostedPagesTitle(cls.name),
        projects: projects.map((p) => ({
          title: p.title,
          tourUrl: p.tourUrl,
          qrUrl: p.qrUrl,
          hostedPath: p.hostedPath,
          studentName: p.studentName,
          className: p.className,
          updatedAt: p.updatedAt,
        })),
      });
    } catch (err) {
      console.error('hosted-projects list error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  });
}

module.exports = { registerHostedProjectsRoutes };
