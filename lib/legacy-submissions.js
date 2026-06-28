const fs = require('fs');
const path = require('path');

const SUBMISSIONS_FILE = 'submissions.json';

function loadSubmissionsLog() {
  if (!fs.existsSync(SUBMISSIONS_FILE)) return [];
  const raw = fs.readFileSync(SUBMISSIONS_FILE, 'utf8');
  const lines = raw.split('\n');
  const entries = [];
  let buffer = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    buffer += trimmed;
    try {
      entries.push(JSON.parse(buffer));
      buffer = '';
    } catch (_) {
      continue;
    }
  }
  if (buffer) {
    console.warn(
      '⚠ Unparsed trailing submissions.json content (discarded):',
      buffer.slice(0, 80)
    );
  }
  return entries;
}

function writeSubmissionsLog(entries) {
  const data = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
  fs.writeFileSync(SUBMISSIONS_FILE, data, 'utf8');
}

function legacyToInboxItem(submission) {
  return {
    id: `legacy:${submission.fileName}`,
    threadId: `legacy-thread:${submission.fileName}`,
    versionNumber: 1,
    kind: 'submitted',
    b2Path: submission.remotePath,
    fileName: submission.fileName,
    studentNote: submission.studentNote,
    projectName: submission.projectName,
    studentDisplayName: submission.studentName,
    studentName: submission.studentName,
    className: submission.className,
    hostedPath: submission.hostedPath,
    hostedUrl: submission.hostedUrl,
    hostedAt: submission.hostedAt,
    isHosted: submission.isHosted,
    submittedAt: submission.submittedAt,
    legacy: true,
  };
}

async function syncSubmissionsWithB2(b2Service) {
  const b2Files = await b2Service.listFiles('student-projects/');
  const submissionsMap = new Map();
  loadSubmissionsLog().forEach((sub) => {
    submissionsMap.set(sub.fileName, sub);
  });

  let needsSync = false;
  for (const b2File of b2Files) {
    const fileName = b2File.fileName.replace('student-projects/', '');
    if (!submissionsMap.has(fileName)) {
      const nameParts = fileName.replace(/\.zip$/i, '').split('_');
      const studentName = nameParts[0] || 'unknown';
      const projectName = nameParts.slice(0, -1).join('_') || 'VR_Project';
      submissionsMap.set(fileName, {
        studentName,
        projectName,
        fileName,
        remotePath: b2File.fileName,
        submittedAt: new Date(b2File.uploadTimestamp).toISOString(),
        syncedFromB2: true,
      });
      needsSync = true;
    }
  }

  const b2FileNames = new Set(b2Files.map((f) => f.fileName.replace('student-projects/', '')));
  for (const [fileName] of submissionsMap) {
    if (!b2FileNames.has(fileName)) {
      submissionsMap.delete(fileName);
      needsSync = true;
    }
  }

  if (needsSync) {
    const syncedLogs = Array.from(submissionsMap.values());
    writeSubmissionsLog(syncedLogs);
  }

  return Array.from(submissionsMap.values()).map((submission) => {
    try {
      const hostedPath = submission.hostedPath;
      if (hostedPath && typeof hostedPath === 'string') {
        const hostedDir = path.join('hosted-projects', hostedPath);
        let updatedISO;
        const cfg = path.join(hostedDir, 'config.json');
        if (fs.existsSync(cfg)) {
          updatedISO = fs.statSync(cfg).mtime.toISOString();
        } else {
          const idx = path.join(hostedDir, 'index.html');
          if (fs.existsSync(idx)) updatedISO = fs.statSync(idx).mtime.toISOString();
        }
        if (updatedISO) submission.updatedAt = updatedISO;
      }
    } catch (_) {}
    return submission;
  });
}

function submissionStorageKey(sub) {
  const p = sub.b2Path || sub.remotePath;
  if (p) return String(p).replace(/^student-projects\//, '');
  return String(sub.fileName || '');
}

function deriveSubmissionFromB2File(b2File) {
  const fileName = b2File.fileName.replace('student-projects/', '');
  const nameParts = fileName.replace(/\.zip$/i, '').split('_');
  const studentName = nameParts[0] || 'unknown';
  const projectName = nameParts.slice(0, -1).join('_') || 'VR_Project';
  return {
    studentName,
    projectName,
    fileName,
    remotePath: b2File.fileName,
    submittedAt: new Date(b2File.uploadTimestamp).toISOString(),
    syncedFromB2: true,
  };
}

async function mergeB2OrphansIntoInbox(dbInbox, b2Service, { filter } = {}) {
  const knownKeys = new Set(dbInbox.map(submissionStorageKey));
  const logByFileName = new Map(loadSubmissionsLog().map((s) => [s.fileName, s]));
  const b2Files = await b2Service.listFiles('student-projects/');
  let orphans = [];
  let purgedCheck = null;
  try {
    const { isB2PathPurged } = require('./student-content/purge');
    purgedCheck = isB2PathPurged;
  } catch (_) {}

  for (const b2File of b2Files) {
    const fileName = b2File.fileName.replace('student-projects/', '');
    if (!fileName || knownKeys.has(fileName)) continue;
    if (purgedCheck && (await purgedCheck(b2File.fileName))) continue;
    const submission = logByFileName.get(fileName) || deriveSubmissionFromB2File(b2File);
    orphans.push(legacyToInboxItem(submission));
  }

  if (filter === 'with_notes') {
    orphans = orphans.filter((s) => s.studentNote && String(s.studentNote).trim());
  } else if (filter === 'without_notes') {
    orphans = orphans.filter((s) => !s.studentNote || !String(s.studentNote).trim());
  }

  const merged = [...dbInbox, ...orphans];
  return merged.sort(
    (a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()
  );
}

async function listLegacyInbox(b2Service, { filter } = {}) {
  const submissions = await syncSubmissionsWithB2(b2Service);
  let items = submissions.map(legacyToInboxItem);
  if (filter === 'with_notes') {
    items = items.filter((s) => s.studentNote && String(s.studentNote).trim());
  } else if (filter === 'without_notes') {
    items = items.filter((s) => !s.studentNote || !String(s.studentNote).trim());
  }
  return items.sort(
    (a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()
  );
}

module.exports = {
  loadSubmissionsLog,
  writeSubmissionsLog,
  syncSubmissionsWithB2,
  listLegacyInbox,
  mergeB2OrphansIntoInbox,
  legacyToInboxItem,
  submissionStorageKey,
};
