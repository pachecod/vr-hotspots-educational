const {
  query,
  slugify,
  generateUsername,
  normalizeUsername,
  generateRandomPassword,
  isDbEnabled,
} = require('../services/db-service');
const { hashPassword, loginRateLimiter } = require('../student-auth');
const { getAdminSession } = require('../admin-auth');
const {
  encryptAdminPassword,
  decryptAdminPassword,
} = require('../lib/admin-password-store');
const {
  verifyClassPassword,
  hasClassRosterAccess,
  grantClassRosterAccess,
  isClassPasswordRequired,
} = require('../lib/class-roster-gate');

async function ensureClassBillingAccount(classId) {
  const existing = await query(
    `SELECT id FROM billing_accounts WHERE scope_type = 'class' AND scope_id = $1`,
    [classId]
  );
  if (existing.rows.length) return existing.rows[0].id;
  const inserted = await query(
    `INSERT INTO billing_accounts (scope_type, scope_id, plan_tier, status, limit_overrides)
     VALUES ('class', $1, 'free', 'active', '{}'::jsonb) RETURNING id`,
    [classId]
  );
  return inserted.rows[0].id;
}

async function listPublicClasses() {
  const { rows } = await query(
    `SELECT c.id, c.name, c.description, c.require_sign_in_password,
            (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id AND s.is_active = TRUE) AS student_count
     FROM classes c
     ORDER BY c.name ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    require_sign_in_password: !!r.require_sign_in_password,
    student_count: r.student_count,
  }));
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
    `SELECT c.id, c.name, c.description, c.slug, c.created_at, c.updated_at, c.password_set_at,
            c.require_sign_in_password,
            (c.password_hash IS NOT NULL) AS has_sign_in_password,
            (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id) AS student_count,
            ba.plan_tier, ba.status AS billing_status
     FROM classes c
     LEFT JOIN billing_accounts ba ON ba.scope_type = 'class' AND ba.scope_id = c.id
     ORDER BY c.name ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    slug: r.slug,
    created_at: r.created_at,
    updated_at: r.updated_at,
    password_set_at: r.password_set_at,
    require_sign_in_password: !!r.require_sign_in_password,
    has_sign_in_password: !!r.has_sign_in_password,
    student_count: r.student_count,
    plan_tier: r.plan_tier,
    billing_status: r.billing_status,
  }));
}

async function createClass({ name, description, password, requireSignInPassword }) {
  const slug = slugify(name);
  const requirePassword = !!requireSignInPassword;
  let plainPassword = null;
  let passwordHash = null;
  let passwordEncrypted = null;
  let passwordSetAt = null;

  if (requirePassword) {
    plainPassword = password || generateRandomPassword();
    passwordHash = await hashPassword(plainPassword);
    passwordEncrypted = encryptAdminPassword(plainPassword);
    passwordSetAt = new Date();
  }

  const { rows } = await query(
    `INSERT INTO classes (name, description, slug, password_hash, password_encrypted, password_set_at, require_sign_in_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      name.trim(),
      description || null,
      slug,
      passwordHash,
      passwordEncrypted,
      passwordSetAt,
      requirePassword,
    ]
  );
  await ensureClassBillingAccount(rows[0].id);
  return { class: rows[0], plainPassword };
}

async function setClassSignInPassword(classId, password) {
  const plainPassword = password || generateRandomPassword();
  const passwordHash = await hashPassword(plainPassword);
  const passwordEncrypted = encryptAdminPassword(plainPassword);
  const { rows } = await query(
    `UPDATE classes SET password_hash = $1, password_encrypted = $2, password_set_at = NOW(),
            require_sign_in_password = TRUE, updated_at = NOW()
     WHERE id = $3 RETURNING id, name, password_set_at, require_sign_in_password`,
    [passwordHash, passwordEncrypted, classId]
  );
  return { class: rows[0] || null, plainPassword };
}

async function setClassSignInPasswordRequired(classId, { requireSignInPassword, password } = {}) {
  if (!requireSignInPassword) {
    const { rows } = await query(
      `UPDATE classes SET password_hash = NULL, password_encrypted = NULL, password_set_at = NULL,
              require_sign_in_password = FALSE, updated_at = NOW()
       WHERE id = $1 RETURNING id, name, require_sign_in_password`,
      [classId]
    );
    return { class: rows[0] || null, plainPassword: null };
  }
  return setClassSignInPassword(classId, password);
}

async function getClassSignInPassword(classId) {
  const { rows } = await query(`SELECT password_encrypted FROM classes WHERE id = $1`, [classId]);
  if (!rows.length) return null;
  return decryptAdminPassword(rows[0].password_encrypted);
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
  const { rows } = await query(`SELECT id FROM students WHERE class_id = $1`, [id]);
  const { purgeStudentAccount } = require('../lib/student-content/purge');
  for (const row of rows) {
    await purgeStudentAccount(row.id);
  }
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

async function ensureUniqueUsername(baseUsername, { excludeStudentId } = {}) {
  let username = baseUsername;
  let suffix = 1;
  while (true) {
    let sql = `SELECT id FROM students WHERE username = $1`;
    const params = [username];
    if (excludeStudentId) {
      sql += ` AND id != $2`;
      params.push(excludeStudentId);
    }
    const { rows } = await query(sql, params);
    if (!rows.length) return username;
    username = `${baseUsername}${suffix}`;
    suffix++;
    if (suffix > 999) throw new Error('Could not generate unique username');
  }
}

async function assertUsernameAvailable(username, excludeStudentId) {
  let sql = `SELECT id FROM students WHERE username = $1`;
  const params = [username];
  if (excludeStudentId) {
    sql += ` AND id != $2`;
    params.push(excludeStudentId);
  }
  const { rows } = await query(sql, params);
  if (rows.length) {
    const err = new Error('That username is already in use');
    err.code = '23505';
    err.constraint = 'students_username_key';
    throw err;
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

async function updateStudent(id, { displayName, username, classId, isActive }) {
  const fields = [];
  const params = [];
  let i = 1;
  let trimmedDisplayName;
  let trimmedUsername;

  if (displayName !== undefined) {
    trimmedDisplayName = String(displayName).trim();
    if (!trimmedDisplayName) {
      throw new Error('Display name is required');
    }
    fields.push(`display_name = $${i++}`);
    params.push(trimmedDisplayName);
  }

  if (username !== undefined) {
    trimmedUsername = normalizeUsername(username);
    await assertUsernameAvailable(trimmedUsername, id);
    fields.push(`username = $${i++}`);
    params.push(trimmedUsername);
  } else if (trimmedDisplayName !== undefined) {
    trimmedUsername = await ensureUniqueUsername(generateUsername(trimmedDisplayName), {
      excludeStudentId: id,
    });
    fields.push(`username = $${i++}`);
    params.push(trimmedUsername);
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
  const student = rows[0] || null;
  if (student && trimmedDisplayName !== undefined) {
    await query(`UPDATE submissions SET student_name = $1, updated_at = NOW() WHERE student_id = $2`, [
      trimmedDisplayName,
      id,
    ]);
  }
  return student;
}

async function deleteStudent(id) {
  const { purgeStudentAccount } = require('../lib/student-content/purge');
  await purgeStudentAccount(id);
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

async function getPasswordReport({ classId } = {}) {
  let sql = `SELECT s.id, s.display_name, s.username, s.password_encrypted, s.password_set_at, s.is_active,
                    c.name AS class_name
             FROM students s JOIN classes c ON c.id = s.class_id`;
  const params = [];
  if (classId) {
    sql += ` WHERE s.class_id = $1`;
    params.push(classId);
  }
  sql += ` ORDER BY c.name, s.display_name`;
  const { rows } = await query(sql, params);
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
      const classId = req.params.classId;
      const isAdmin = !!getAdminSession(req);
      if (!isAdmin) {
        const passwordRequired = await isClassPasswordRequired(classId);
        if (passwordRequired && !hasClassRosterAccess(req, classId)) {
          return res.status(401).json({
            success: false,
            message: 'Team or class password required',
          });
        }
      }
      const students = await listPublicStudentsInClass(classId);
      res.json(students.map((s) => ({ id: s.id, display_name: s.display_name })));
    } catch (err) {
      console.error('List students error:', err);
      res.status(500).json({ success: false, message: 'Failed to load students' });
    }
  });

  app.post('/api/classes/:classId/verify-password', loginRateLimiter, async (req, res) => {
    if (!isDbEnabled()) {
      return res.status(503).json({ success: false, message: 'Database not configured' });
    }
    const classId = req.params.classId;
    const password = req.body && req.body.password;
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }
    try {
      const verification = await verifyClassPassword(classId, password);
      if (verification.reason === 'not_configured') {
        return res.status(403).json({
          success: false,
          message: 'This team or class does not use a sign-in password. Choose your name directly.',
        });
      }
      if (!verification.ok) {
        return res.status(401).json({ success: false, message: 'Incorrect team or class password' });
      }
      grantClassRosterAccess(res, classId);
      return res.json({ success: true });
    } catch (err) {
      console.error('Verify class password error:', err);
      return res.status(500).json({ success: false, message: 'Could not verify password' });
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
      const { name, description, password, requireSignInPassword } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Team or class name is required' });
      }
      const result = await createClass({
        name,
        description,
        password,
        requireSignInPassword: !!requireSignInPassword,
      });
      res.json({
        success: true,
        class: {
          id: result.class.id,
          name: result.class.name,
          description: result.class.description,
          slug: result.class.slug,
          require_sign_in_password: !!result.class.require_sign_in_password,
          has_sign_in_password: !!result.class.password_hash,
          password_set_at: result.class.password_set_at,
        },
        signInPassword: result.plainPassword,
      });
    } catch (err) {
      const msg = err.code === '23505' ? 'Team or class name already exists' : err.message;
      res.status(400).json({ success: false, message: msg });
    }
  });

  app.put('/admin/classes/:id', requireAdmin, requireDb, async (req, res) => {
    try {
      const updated = await updateClass(req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ success: false, message: 'Team or class not found' });
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

  app.get('/admin/classes/:id/sign-in-password', requireAdmin, requireDb, async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT id, password_encrypted, require_sign_in_password FROM classes WHERE id = $1`,
        [req.params.id]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Team or class not found' });
      }
      const password = decryptAdminPassword(rows[0].password_encrypted);
      res.json({
        success: true,
        password,
        requireSignInPassword: !!rows[0].require_sign_in_password,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/admin/classes/:id/sign-in-password', requireAdmin, requireDb, async (req, res) => {
    try {
      const body = req.body || {};
      if (body.requireSignInPassword === false) {
        const result = await setClassSignInPasswordRequired(req.params.id, {
          requireSignInPassword: false,
        });
        if (!result.class) {
          return res.status(404).json({ success: false, message: 'Team or class not found' });
        }
        return res.json({
          success: true,
          class: result.class,
          signInPassword: null,
          requireSignInPassword: false,
        });
      }

      const requireSignInPassword = body.requireSignInPassword === true || !!body.password;
      const result = await setClassSignInPasswordRequired(req.params.id, {
        requireSignInPassword: true,
        password: body.password,
      });
      if (!result.class) {
        return res.status(404).json({ success: false, message: 'Team or class not found' });
      }
      res.json({
        success: true,
        class: result.class,
        signInPassword: result.plainPassword,
        requireSignInPassword: true,
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  app.delete('/admin/classes/:id/sign-in-password', requireAdmin, requireDb, async (req, res) => {
    try {
      const result = await setClassSignInPasswordRequired(req.params.id, {
        requireSignInPassword: false,
      });
      if (!result.class) {
        return res.status(404).json({ success: false, message: 'Team or class not found' });
      }
      res.json({
        success: true,
        class: result.class,
        requireSignInPassword: false,
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
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
      if (!updated) return res.status(404).json({ success: false, message: 'Team member or student not found' });
      res.json({ success: true, student: updated });
    } catch (err) {
      let msg = err.message;
      if (err.code === '23505') {
        if (err.constraint === 'students_username_key') {
          msg = 'That username is already in use';
        } else {
          msg = 'Another team member or student in this class already has that name';
        }
      }
      res.status(400).json({ success: false, message: msg });
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
      if (!result.student) return res.status(404).json({ success: false, message: 'Team member or student not found' });
      res.json({ success: true, student: result.student, password: result.plainPassword });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/admin/students/sample-password', requireAdmin, (req, res) => {
    res.json({ password: generateRandomPassword() });
  });

  app.get('/admin/students/password-report', requireAdmin, requireDb, async (req, res) => {
    try {
      const format = req.query.format || 'json';
      const classId = req.query.classId || null;
      const rows = await getPasswordReport({ classId });
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
