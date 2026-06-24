const { query } = require('./db-service');
const { getTierLimits, isUnlimited, bytesFromMb } = require('../lib/plan-tiers');
const { resolveClassLimits } = require('../lib/class-limits');

async function getClassBillingAccount(classId) {
  const { rows } = await query(
    `SELECT * FROM billing_accounts WHERE scope_type = 'class' AND scope_id = $1`,
    [classId]
  );
  const row = rows[0] || { plan_tier: 'free', status: 'active', limit_overrides: {} };
  if (!row.limit_overrides || typeof row.limit_overrides !== 'object') {
    row.limit_overrides = {};
  }
  return row;
}

async function getStudentBillingAccount(studentId) {
  const { rows } = await query(
    `SELECT * FROM billing_accounts WHERE scope_type = 'student' AND scope_id = $1`,
    [studentId]
  );
  return rows[0] || null;
}

function currentPeriodStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function getClassStorageBytes(classId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(sa.size), 0)::bigint AS total
     FROM student_assets sa
     JOIN students s ON s.id = sa.student_id
     WHERE s.class_id = $1`,
    [classId]
  );
  return Number(rows[0].total || 0);
}

async function getStudentStorageBytes(studentId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(size), 0)::bigint AS total FROM student_assets WHERE student_id = $1`,
    [studentId]
  );
  return Number(rows[0].total || 0);
}

async function getClassSubmissionCount(classId, periodStart) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM submissions sub
     JOIN students s ON s.id = sub.student_id
     WHERE s.class_id = $1 AND sub.submitted_at >= $2`,
    [classId, periodStart]
  );
  return rows[0].total || 0;
}

async function getClassHostedCount(classId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM submissions sub
     JOIN students s ON s.id = sub.student_id
     WHERE s.class_id = $1 AND sub.is_hosted = TRUE`,
    [classId]
  );
  return rows[0].total || 0;
}

async function getStudentAssetFileCount(studentId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM student_assets WHERE student_id = $1`,
    [studentId]
  );
  return rows[0].total || 0;
}

async function getUsageSummary({ classId, studentId }) {
  const classBilling = await getClassBillingAccount(classId);
  const studentBilling = studentId ? await getStudentBillingAccount(studentId) : null;
  const effectiveTier = studentBilling && studentBilling.plan_tier !== 'free'
    ? studentBilling.plan_tier
    : classBilling.plan_tier || 'free';
  const limits = resolveClassLimits(effectiveTier, classBilling.limit_overrides);
  const tierDefaults = getTierLimits(effectiveTier);
  const periodStart = currentPeriodStart();

  const [classStorage, studentStorage, submissions, hosted, assetFiles] = await Promise.all([
    getClassStorageBytes(classId),
    studentId ? getStudentStorageBytes(studentId) : 0,
    getClassSubmissionCount(classId, periodStart),
    getClassHostedCount(classId),
    studentId ? getStudentAssetFileCount(studentId) : 0,
  ]);

  const storageLimitBytes = limits.personalStorageMbPooled
    ? bytesFromMb(limits.personalStorageMbPooled)
    : bytesFromMb((limits.personalStorageMbPerStudent || 100) * 100);

  return {
    planTier: effectiveTier,
    limits,
    tierDefaults,
    limitOverrides: classBilling.limit_overrides || {},
    usage: {
      classStorageBytes: classStorage,
      studentStorageBytes: studentStorage,
      submissionCount: submissions,
      hostedProjectCount: hosted,
      assetFileCount: assetFiles,
    },
    periodStart: periodStart.toISOString(),
  };
}

function quotaError(metric, limit, current, upgradeUrl = '/admin-billing.html') {
  const messages = {
    submission_count: 'Monthly submission limit reached for this class.',
    hosted_project_count: 'Hosted project limit reached for this class.',
    personal_storage_bytes: 'Storage limit reached for this class.',
    asset_file_count: 'Student asset file limit reached.',
  };
  const err = new Error(messages[metric] || 'Usage limit reached.');
  err.statusCode = 402;
  err.payload = {
    code: 'quota_exceeded',
    metric,
    limit,
    current,
    upgradeUrl,
    message: messages[metric] || 'Usage limit reached. Ask your teacher to adjust class limits.',
  };
  return err;
}

async function assertCanUploadAsset({ classId, studentId, additionalBytes = 0 }) {
  const summary = await getUsageSummary({ classId, studentId });
  const { limits, usage } = summary;

  if (!isUnlimited(limits.maxAssetFilesPerStudent)) {
    if (usage.assetFileCount >= limits.maxAssetFilesPerStudent) {
      throw quotaError('asset_file_count', limits.maxAssetFilesPerStudent, usage.assetFileCount);
    }
  }

  const storageLimit = limits.personalStorageMbPooled
    ? bytesFromMb(limits.personalStorageMbPooled)
    : bytesFromMb(limits.personalStorageMbPerStudent || 100);

  if (!isUnlimited(storageLimit)) {
    const total = limits.personalStorageMbPooled ? usage.classStorageBytes : usage.studentStorageBytes;
    if (total + additionalBytes > storageLimit) {
      throw quotaError('personal_storage_bytes', storageLimit, total);
    }
  }
}

async function assertCanSubmit({ classId }) {
  const summary = await getUsageSummary({ classId });
  const { limits, usage } = summary;
  if (!isUnlimited(limits.submissionsPerMonth)) {
    if (usage.submissionCount >= limits.submissionsPerMonth) {
      throw quotaError('submission_count', limits.submissionsPerMonth, usage.submissionCount);
    }
  }
}

async function assertCanHost({ classId }) {
  const summary = await getUsageSummary({ classId });
  const { limits, usage } = summary;
  if (!isUnlimited(limits.hostedProjects)) {
    if (usage.hostedProjectCount >= limits.hostedProjects) {
      throw quotaError('hosted_project_count', limits.hostedProjects, usage.hostedProjectCount);
    }
  }
}

module.exports = {
  getUsageSummary,
  assertCanUploadAsset,
  assertCanSubmit,
  assertCanHost,
  getClassBillingAccount,
};
