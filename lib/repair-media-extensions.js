/**
 * Repair extensionless image/video files inside a project ZIP.
 * Hotspot exports sometimes stored bare UUID names; viewers that key off
 * filename extension show black planes until a suffix is added.
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const EXT_RE = /\.[a-zA-Z0-9]{2,5}$/;

function sniffExtension(buf) {
  if (!buf || buf.length < 12) return null;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return '.png';
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif';
  // WebP (RIFF....WEBP)
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return '.webp';
  }
  // MP4 / QuickTime-ish (ftyp at offset 4)
  if (
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (/qt/i.test(brand)) return '.mov';
    return '.mp4';
  }
  // WebM / Matroska
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return '.webm';
  }
  return null;
}

function normalizeEntryPath(entryName) {
  return String(entryName || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isMediaFolderEntry(entryPath) {
  return /^(images|videos)\//i.test(entryPath) && !entryPath.endsWith('/');
}

function hasExtension(entryPath) {
  const base = path.posix.basename(entryPath);
  return EXT_RE.test(base);
}

function buildExactPathMap(renames) {
  const map = new Map();
  for (const { from, to } of renames) {
    const fromBase = path.posix.basename(from);
    const toBase = path.posix.basename(to);
    const pairs = [
      [`./${from}`, `./${to}`],
      [from, to],
      [`./images/${fromBase}`, `./images/${toBase}`],
      [`./videos/${fromBase}`, `./videos/${toBase}`],
      [`images/${fromBase}`, `images/${toBase}`],
      [`videos/${fromBase}`, `videos/${toBase}`],
    ];
    for (const [a, b] of pairs) {
      if (a && a !== b) map.set(a, b);
    }
  }
  return map;
}

/** Exact string equality only — substring replace double-appended extensions. */
function rewriteConfigValue(val, pathMap) {
  if (typeof val === 'string') {
    return pathMap.has(val) ? pathMap.get(val) : val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => rewriteConfigValue(item, pathMap));
  }
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = rewriteConfigValue(v, pathMap);
    }
    return out;
  }
  return val;
}

function rewriteConfigText(text, renames) {
  if (!text || !renames.length) return { text, changed: false };
  const pathMap = buildExactPathMap(renames);
  try {
    const parsed = JSON.parse(text);
    const rewritten = rewriteConfigValue(parsed, pathMap);
    const out = JSON.stringify(rewritten, null, 2);
    return { text: out, changed: out !== JSON.stringify(parsed, null, 2) };
  } catch (_) {
    // Non-JSON fallback: replace only JSON-string literals "path"
    let out = text;
    let changed = false;
    const keys = [...pathMap.keys()].sort((a, b) => b.length - a.length);
    for (const a of keys) {
      const b = pathMap.get(a);
      const quoted = `"${a}"`;
      const quotedTo = `"${b}"`;
      if (out.includes(quoted)) {
        out = out.split(quoted).join(quotedTo);
        changed = true;
      }
    }
    return { text: out, changed };
  }
}

/**
 * @param {string} inputZipPath
 * @param {string} outputZipPath
 * @returns {{ renamed: Array<{from:string,to:string,type:string}>, skipped: Array<{path:string,reason:string}>, configUpdated: boolean, repaired: boolean }}
 */
function repairMediaExtensionsInZip(inputZipPath, outputZipPath) {
  const zip = new AdmZip(inputZipPath);
  const entries = zip.getEntries();
  const renames = [];
  const skipped = [];
  /** @type {Map<string, { data: Buffer, entryName: string }>} */
  const pendingAdds = new Map();
  const pendingDeletes = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryPath = normalizeEntryPath(entry.entryName);
    if (!isMediaFolderEntry(entryPath)) continue;
    if (hasExtension(entryPath)) continue;

    let data;
    try {
      data = entry.getData();
    } catch (err) {
      skipped.push({ path: entryPath, reason: `read_failed:${err.message}` });
      continue;
    }
    const ext = sniffExtension(data);
    if (!ext) {
      skipped.push({ path: entryPath, reason: 'unrecognized_type' });
      continue;
    }
    const newPath = entryPath + ext;
    // Avoid colliding with an existing entry
    const collision = entries.some(
      (e) => !e.isDirectory && normalizeEntryPath(e.entryName) === newPath
    );
    if (collision || pendingAdds.has(newPath)) {
      skipped.push({ path: entryPath, reason: 'target_exists' });
      continue;
    }
    pendingDeletes.push(entry.entryName);
    pendingAdds.set(newPath, { data, entryName: newPath });
    renames.push({ from: entryPath, to: newPath, type: ext.replace(/^\./, '') });
  }

  if (!renames.length) {
    return {
      renamed: [],
      skipped,
      configUpdated: false,
      repaired: false,
    };
  }

  for (const name of pendingDeletes) {
    zip.deleteFile(name);
  }
  for (const { data, entryName } of pendingAdds.values()) {
    zip.addFile(entryName, data);
  }

  let configUpdated = false;
  const configEntry = zip.getEntry('config.json');
  if (configEntry && !configEntry.isDirectory) {
    try {
      const raw = configEntry.getData().toString('utf8');
      const { text, changed } = rewriteConfigText(raw, renames);
      if (changed) {
        zip.updateFile('config.json', Buffer.from(text, 'utf8'));
        configUpdated = true;
      }
    } catch (err) {
      skipped.push({ path: 'config.json', reason: `config_update_failed:${err.message}` });
    }
  }

  // Also rewrite other root text configs that may reference media paths
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const p = normalizeEntryPath(entry.entryName);
    if (p === 'config.json') continue;
    if (!/^(config\.ui\.json|README\.md)$/i.test(p) && !/^flat-pages\/.*\.json$/i.test(p)) {
      continue;
    }
    try {
      const raw = entry.getData().toString('utf8');
      const { text, changed } = rewriteConfigText(raw, renames);
      if (changed) {
        zip.updateFile(entry.entryName, Buffer.from(text, 'utf8'));
        configUpdated = true;
      }
    } catch (_) {
      /* ignore */
    }
  }

  const outDir = path.dirname(outputZipPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  zip.writeZip(outputZipPath);

  return {
    renamed: renames,
    skipped,
    configUpdated,
    repaired: renames.length > 0,
  };
}

module.exports = {
  sniffExtension,
  repairMediaExtensionsInZip,
  rewriteConfigText,
};
