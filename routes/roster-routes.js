const {
  query,
  slugify,
  generateUsername,
  generateRandomPassword,
  isDbEnabled,
} = require('../services/db-service');
const { hashPassword } = require('../student-auth');
const {
  encryptAdminPassword,
  decryptAdminPassword,
} = require('../lib/admin-password-store');

async function ensureClassBillingAccount(classId) {
  const existing = await query(
    `SELECT id FROM billing_accounts WHERE scope_type = 'class' AND scope_id = $1`,
    [classId]
  );
  if (existing.rows.length) return existing.rows[0].id;
  const inserted = await query(
    `INSERT INTO billing_accounts (scope_type, scope_id, plan_tier, status)
     VALUES ('class', $1, 'free', 'active') RETURNING id`,
    [classId]
  );
  return inserted.rows[0].id;
}

async function listPublicClasses() {
  const { rows } = await query(
    `SELECT c.id, c.name, c.description,
            (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id AND s.is_active = TRUE) AS student_count
     FROM classes c
     ORDER BY c.name ASC`
  );
  return rows;
}

async function listPublicStudentsInClass(classId) {
  const { rows } = await query(
    `SELECT id, display_name FROM students
     WHERE class_id = $1 AND is_active = TRUE
     ORDER BY display_name ASC`,
    [classId]
  );
  return rows;
}

async function listClassesAdmin() {
  const { rows } = await query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id) AS student_count,
            ba.plan_tier, ba.status AS billing_status
     FROM classes c
     LEFT JOIN billing_accounts ba ON ba.scope_type = 'class' AND ba.scope_id = c.id
     ORDER BY c.name ASC`
  );
  return rows;
}

async function createClass({ name, description }) {
  const slug = slugify(name);
  const { rows } = await query(
    `INSERT INTO classes (name, description, slug) VALUES ($1, $2, $3) RETURNING *`,
    [name.trim(), description || null, slug]
  );
  await ensureClassBillingAccount(rows[0].id);
  return rows[0];
}

async function updateClass(id, { name, description }) {
  const slug = slugify(name);
  const { rows } = await query(
    `UPDATE classes SET name = $1, description = $2, slug = $3, updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [name.trim(), description || null, slug, id]
  );
  return rows[0] || null;
}

async function deleteClass(id) {
  await query(`DELETE FROM classes WHERE id = $1`, [id]);
}

async function listStudentsAdmin({ classId } = {}) {
  let sql = `SELECT s.*, c.name AS class_name, c.slug AS class_slug
             FROM students s JOIN classes c ON c.id = s.class_id`;
  const params = [];
  if (classId) {
    sql += ` WHERE s.class_id = $1`;
    params.push(classId);
  }
  sql += ` ORDER BY c.name ASC, s.display_name ASC`;
  const { rows } = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    password: undefined,
  }));
}

async function ensureUniqueUsername(baseUsername) {
  let username = baseUsername;
  let suffix = 1;
  while (true) {
    const { rows } = await query(`SELECT id FROM students WHERE username = $1`, [username]);
    if (!rows.length) return username;
    username = `${baseUsername}${suffix}`;
    suffix++;
    if (suffix > 999) throw new Error('Could not generate unique username');
  }
}

async function createStudent({ classId, displayName, password }) {
  const plainPassword = password || generateRandomPassword();
  const passwordHash = await hashPassword(plainPassword);
  const passwordEncrypted = encryptAdminPassword(plainPassword);
  const baseUsername = generateUsername(displayName);
  const username = await ensureUniqueUsername(baseUsername);
  const { rows } = await query(
    `INSERT INTO students (class_id, display_name, username, password_hash, password_encrypted, password_set_at)
     VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
    [classId, displayName.trim(), username, passwordHash, passwordEncrypted]
  );
  return { student: rows[0], plainPassword };
}

async function updateStudent(id, { displayName, classId, isActive }) {
  const fields = [];
  const params = [];
  let i = 1;
  if (displayName !== undefined) {
    fields.push(`display_name = $${i++}`);
    params.push(displayName.trim());
  }
  if (classId !== undefined) {
    fields.push(`class_id = $${i++}`);
    params.push(classId);
  }
  if (isActive !== undefined) {
    fields.push(`is_active = $${i++}`);
    params.push(!!isActive);
  }
  if (!fields.length) return null;
  fields.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(
    `UPDATE students SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function deleteStudent(id) {
  await query(`DELETE FROM students WHERE id = $1`, [id]);
}

async function resetStudentPassword(id, password) {
  const plainPassword = password || generateRandomPassword();
  const passwordHash = await hashPassword(plainPassword);
  const passwordEncrypted = encryptAdminPassword(plainPassword);
  const { rows } = await query(
    `UPDATE students SET password_hash = $1, password_encrypted = $2, password_set_at = NOW(), updated_at = NOW()
     WHERE id = $3 RETURNING id, display_name, username, class_id`,
    [passwordHash, passwordEncrypted, id]
  );
  return { student: rows[0], plainPassword };
}

async function getPasswordReport() {
  const { rows } = await query(
    `SELECT s.id, s.display_name, s.username, s.password_encrypted, s.password_set_at, s.is_active,
            c.name AS class_name
     FROM students s JOIN classes c ON c.id = s.class_id
     ORDER BY c.name, s.display_name`
  );
  return rows.map((row) => ({
    ...row,
    password: decryptAdminPassword(row.password_encrypted),
  }));
}

function registerRosterRoutes(app, { requireAdmin }) {
  function requireDb(req, res, next) {
    if (!isDbEnabled()) {
      return res.status(503).json({ success: false, message: 'Database not configured (set DATABASE_URL)' });
    }
    return next();
  }

  app.get('/api/classes', async (req, res) => {
    if (!isDbEnabled()) return res.json([]);
    try {
      const classes = await listPublicClasses();
      res.json(classes);
    } catch (err) {
      console.error('List classes error:', err);
      res.status(500).json({ success: false, message: 'Failed to load classes' });
    }
  });

  app.get('/api/classes/:classId/students', async (req, res) => {
    if (!isDbEnabled()) return res.json([]);
    try {
      const students = await listPublicStudentsInClass(req.params.classId);
      res.json(students.map((s) => ({ id: s.id, display_name: s.display_name })));
    } catch (err) {
      console.error('List students error:', err);
      res.status(500).json({ success: false, message: 'Failed to load students' });
    }
  });

  app.get('/admin/classes', requireAdmin, requireDb, async (req, res) => {
    try {
      res.json(await listClassesAdmin());
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/classes', requireAdmin, requireDb, async (req, res) => {
    try {
      const { name, description } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Class name is required' });
      }
      const created = await createClass({ name, description });
      res.json({ success: true, class: created });
    } catch (err) {
      const msg = err.code === '23505' ? 'Class name already exists' : err.message;
      res.status(400).json({ success: false, message: msg });
    }
  });

  app.put('/admin/classes/:id', requireAdmin, requireDb, async (req, res) => {
    try {
      const updated = await updateClass(req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ success: false, message: 'Class not found' });
      res.json({ success: true, class: updated });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  app.delete('/admin/classes/:id', requireAdmin, requireDb, async (req, res) => {
    try {
      await deleteClass(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/students', requireAdmin, requireDb, async (req, res) => {
    try {
      const classId = req.query.classId || null;
      res.json(await listStudentsAdmin({ classId }));
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/students', requireAdmin, requireDb, async (req, res) => {
    try {
      const { classId, displayName, password } = req.body || {};
      if (!classId || !displayName) {
        return res.status(400).json({ success: false, message: 'classId and displayName are required' });
      }
      const result = await createStudent({ classId, displayName, password });
      res.json({
        success: true,
        student: {
          id: result.student.id,
          display_name: result.student.display_name,
          username: result.student.username,
          class_id: result.student.class_id,
        },
        password: result.plainPassword,
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  app.put('/admin/students/:id', requireAdmin, requireDb, async (req, res) => {
    try {
      const updated = await updateStudent(req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ success: false, message: 'Student not found' });
      res.json({ success: true, student: updated });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  app.delete('/admin/students/:id', requireAdmin, requireDb, async (req, res) => {
    try {
      await deleteStudent(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/students/:id/reset-password', requireAdmin, requireDb, async (req, res) => {
    try {
      const result = await resetStudentPassword(req.params.id, req.body && req.body.password);
      if (!result.student) return res.status(404).json({ success: false, message: 'Student not found' });
      res.json({ success: true, student: result.student, password: result.plainPassword });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/students/password-report', requireAdmin, requireDb, async (req, res) => {
    try {
      const format = req.query.format || 'json';
      const rows = await getPasswordReport();
      if (format === 'csv') {
        const header = 'class_name,display_name,username,password,password_set_at,is_active\n';
        const body = rows
          .map((r) =>
            [
              r.class_name,
              r.display_name,
              r.username,
              r.password || '',
              r.password_set_at || '',
              r.is_active,
            ]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(',')
          )
          .join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="student-passwords.csv"');
        return res.send(header + body);
      }
      res.json(
        rows.map((r) => ({
          class_name: r.class_name,
          display_name: r.display_name,
          username: r.username,
          password: r.password || null,
          password_set_at: r.password_set_at,
          is_active: r.is_active,
        }))
      );
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = {
  registerRosterRoutes,
  listPublicClasses,
  listPublicStudentsInClass,
  ensureClassBillingAccount,
};
