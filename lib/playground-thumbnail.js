const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const b2Service = require('../services/b2-service');
const { isFfmpegAvailable } = require('./video-transcode');
const { buildPreviewDocumentFromManifest } = require('./flat-preview-document');
const { captureHtmlScreenshot } = require('./page-screenshot');
const { buildRemotePath, buildAdminRemotePath } = require('./common-assets');
const { registerSiteAsset, deleteSiteAssetRecord } = require('./site-assets');
const { query, isDbEnabled } = require('../services/db-service');

const THUMB_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
const THUMB_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];

const MIME_TO_THUMB_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/x-png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

function resolveThumbUploadExtension(localPath, contentType, originalName) {
  const fromPath = path.extname(String(localPath || '')).toLowerCase();
  if (fromPath) return fromPath;
  const fromName = path.extname(String(originalName || '')).toLowerCase();
  if (fromName) return fromName;
  const mime = String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  return MIME_TO_THUMB_EXT[mime] || '';
}

function mimeForThumbExtension(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/jpeg';
}

function playgroundThumbFilename(slug, ext = '.jpg') {
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `playground-${slug}${safeExt}`;
}

/** B2 object key under the admin-only images category. */
function playgroundThumbRemotePath(slug, ext = '.jpg') {
  return buildAdminRemotePath('images', playgroundThumbFilename(slug, ext));
}

/** Legacy B2 key from early playground thumbnail uploads. */
function playgroundThumbLegacyRemotePath(slug, ext = '.jpg') {
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `playground-thumbs/${slug}${safeExt}`;
}

function playgroundThumbKey(slug, ext = '.jpg') {
  return playgroundThumbRemotePath(slug, ext);
}

function normalizeThumbExtension(ext) {
  if (!ext) return '';
  const value = (ext.startsWith('.') ? ext : `.${ext}`).toLowerCase();
  return value === '.jpeg' ? '.jpg' : value;
}

function orderedThumbExtensions(preferredExt) {
  const preferred = normalizeThumbExtension(preferredExt);
  const rest = THUMB_EXTENSIONS.filter((ext) => normalizeThumbExtension(ext) !== preferred);
  return preferred ? [preferred, ...rest] : [...THUMB_EXTENSIONS];
}

function parsePlaygroundThumbnailSlug(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^(.*?)(\.(jpe?g|png|webp|gif|svg))?$/i);
  const slug = (match?.[1] || '').trim();
  const preferredExt = normalizeThumbExtension(match?.[3] ? `.${match[3]}` : '');
  return { slug, preferredExt: preferredExt || null };
}

function playgroundThumbServeUrl(slug, ext) {
  const normalizedExt = normalizeThumbExtension(ext);
  const suffix = normalizedExt || '';
  return `/api/playground/thumbnails/${encodeURIComponent(slug)}${suffix}`;
}

function playgroundThumbLookupPaths(slug, preferredExt) {
  const paths = [];
  const extOrder = orderedThumbExtensions(preferredExt);
  for (const ext of extOrder) {
    paths.push(buildAdminRemotePath('images', playgroundThumbFilename(slug, ext)));
    paths.push(buildRemotePath('images', playgroundThumbFilename(slug, ext)));
  }
  for (const ext of extOrder) {
    paths.push(playgroundThumbLegacyRemotePath(slug, ext));
  }
  return paths;
}

async function getCanonicalPlaygroundThumbPath(slug) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `SELECT b2_path
     FROM site_assets
     WHERE category = 'images'
       AND filename LIKE $1
       AND source IN ('template_thumb', 'upload')
     ORDER BY uploaded_at DESC
     LIMIT 1`,
    [`playground-${slug}.%`]
  );
  return rows[0]?.b2_path || null;
}

async function deleteStalePlaygroundThumbnails(slug, keepExt) {
  const normalizedKeep = normalizeThumbExtension(keepExt);
  const keepFilename = playgroundThumbFilename(slug, normalizedKeep).toLowerCase();
  for (const remotePath of playgroundThumbLookupPaths(slug)) {
    if (path.basename(remotePath).toLowerCase() === keepFilename) continue;
    try {
      await b2Service.deleteCommonAssetEverywhere(remotePath);
    } catch (_) {}
    try {
      await deleteSiteAssetRecord(remotePath);
    } catch (_) {}
  }
}

function contentTypeForThumbPath(remotePath) {
  const lower = String(remotePath || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

function resolvePlaygroundThumbnailUrl(template) {
  if (!template?.slug || !template.thumbnail_url) return null;
  const url = String(template.thumbnail_url);
  if (
    /^https?:\/\//i.test(url) &&
    !url.includes('backblazeb2.com') &&
    !url.includes('/api/playground/thumbnails/')
  ) {
    return url;
  }
  const apiMatch = url.match(/\/api\/playground\/thumbnails\/([^?#]+)/);
  if (apiMatch) {
    const parsed = parsePlaygroundThumbnailSlug(decodeURIComponent(apiMatch[1]));
    return playgroundThumbServeUrl(parsed.slug || template.slug, parsed.preferredExt);
  }
  return playgroundThumbServeUrl(template.slug);
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPlaceholderSvg(title) {
  const label = escapeXml(title || 'WebXRIDE Sample');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea"/>
          <stop offset="100%" style="stop-color:#764ba2"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#g)"/>
      <text x="320" y="190" fill="#fff" font-family="Arial,sans-serif" font-size="28" font-weight="bold" text-anchor="middle">${label}</text>
    </svg>`,
    'utf8'
  );
}

function normalizeZipAssetPath(assetPath) {
  if (!assetPath || typeof assetPath !== 'string') return null;
  if (/^https?:\/\//i.test(assetPath)) return { remoteUrl: assetPath };
  const cleaned = assetPath.replace(/^\.\//, '');
  return { zipPath: cleaned };
}

function pickPrimaryScene(config) {
  const scenes = config.scenes || {};
  const ids = Object.keys(scenes);
  if (!ids.length) return null;
  const preferredId =
    config.currentScene && scenes[config.currentScene] ? config.currentScene : ids[0];
  return { id: preferredId, scene: scenes[preferredId] };
}

function findImageScene(config) {
  const scenes = config.scenes || {};
  const ordered = [
    config.currentScene,
    ...Object.keys(scenes).filter((id) => id !== config.currentScene),
  ].filter(Boolean);
  for (const id of ordered) {
    const scene = scenes[id];
    if (!scene) continue;
    if ((scene.type || 'image') === 'image' && scene.image) {
      return { id, scene };
    }
  }
  return pickPrimaryScene(config);
}

function getZipEntryBuffer(zip, zipPath) {
  const entry = zip.getEntry(zipPath) || zip.getEntry(zipPath.replace(/\//g, '\\'));
  if (!entry) return null;
  return entry.getData();
}

async function extractVideoFrame(videoPath, outputPath) {
  const ffmpeg = require('fluent-ffmpeg');
  const installer = require('@ffmpeg-installer/ffmpeg');
  ffmpeg.setFfmpegPath(installer.path);
  const folder = path.dirname(outputPath);
  const filename = path.basename(outputPath);
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['1'],
        filename,
        folder,
        size: '640x360',
      })
      .on('end', () => resolve(outputPath))
      .on('error', reject);
  });
}

async function uploadThumbnailFile(localPath, slug, contentType, options = {}) {
  const ext = options.ext || path.extname(localPath) || '.jpg';
  await deleteStalePlaygroundThumbnails(slug, ext);
  const remotePath = playgroundThumbRemotePath(slug, ext);
  await b2Service.ensureCommonAssetsBucket();
  await b2Service.uploadCommonAsset(localPath, remotePath, contentType);
  const stat = fs.existsSync(localPath) ? fs.statSync(localPath) : null;
  await registerSiteAsset({
    b2_path: remotePath,
    category: 'images',
    filename: playgroundThumbFilename(slug, ext),
    visibility: 'admin',
    source: options.source || 'template_thumb',
    size: stat?.size || 0,
    content_type: contentType,
  });
  return playgroundThumbServeUrl(slug, ext);
}

async function uploadCustomTemplateThumbnail(template, localPath, contentType, originalName) {
  if (!template?.slug) throw new Error('Template slug is required');
  const ext = resolveThumbUploadExtension(localPath, contentType, originalName);
  if (!THUMB_ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('Thumbnail must be JPEG, PNG, WebP, GIF, or SVG');
  }
  const mime = contentType || mimeForThumbExtension(ext);
  return uploadThumbnailFile(localPath, template.slug, mime, { ext, source: 'template_thumb' });
}

async function uploadThumbnailBuffer(buffer, slug, contentType, ext) {
  const tmp = path.join(os.tmpdir(), `pg-thumb-${Date.now()}${ext}`);
  fs.writeFileSync(tmp, buffer);
  try {
    return await uploadThumbnailFile(tmp, slug, contentType, { ext });
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }
}

async function extractThumbnailFromBundleZip(localZipPath, slug) {
  const zip = new AdmZip(localZipPath);
  const configEntry = zip.getEntry('config.json');
  if (!configEntry) return null;
  const config = JSON.parse(configEntry.getData().toString('utf8'));

  const imageScene = findImageScene(config);
  if (imageScene?.scene?.image) {
    const resolved = normalizeZipAssetPath(imageScene.scene.image);
    if (resolved?.remoteUrl) return resolved.remoteUrl;
    if (resolved?.zipPath) {
      const buf = getZipEntryBuffer(zip, resolved.zipPath);
      if (buf && buf.length) {
        const ext = path.extname(resolved.zipPath) || '.jpg';
        const mime =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : 'image/jpeg';
        return uploadThumbnailBuffer(buf, slug, mime, ext);
      }
    }
  }

  const primary = pickPrimaryScene(config);
  if (primary?.scene?.type === 'video' && primary.scene.videoSrc) {
    const resolved = normalizeZipAssetPath(primary.scene.videoSrc);
    if (resolved?.remoteUrl) return resolved.remoteUrl;
    if (resolved?.zipPath && isFfmpegAvailable()) {
      const videoBuf = getZipEntryBuffer(zip, resolved.zipPath);
      if (videoBuf && videoBuf.length) {
        const videoTmp = path.join(
          os.tmpdir(),
          `pg-video-${Date.now()}${path.extname(resolved.zipPath) || '.mp4'}`
        );
        const frameTmp = path.join(os.tmpdir(), `pg-frame-${Date.now()}.jpg`);
        try {
          fs.writeFileSync(videoTmp, videoBuf);
          await extractVideoFrame(videoTmp, frameTmp);
          return await uploadThumbnailFile(frameTmp, slug, 'image/jpeg');
        } finally {
          try {
            fs.unlinkSync(videoTmp);
          } catch (_) {}
          try {
            fs.unlinkSync(frameTmp);
          } catch (_) {}
        }
      }
    }
  }

  return uploadThumbnailBuffer(
    buildPlaceholderSvg(config.name || slug),
    slug,
    'image/svg+xml',
    '.svg'
  );
}

function manifestUsesAFrame(manifest) {
  const files = Array.isArray(manifest) ? manifest : [];
  return files.some((f) => {
    const content = String(f.content || '');
    const name = String(f.name || '');
    return /<a-scene[\s>]/i.test(content) || /aframe/i.test(content);
  });
}

function pickFlatTemplatePreviewImageUrl(manifest) {
  const files = Array.isArray(manifest) ? manifest : [];
  const configFile = files.find((f) => f.name === 'config.json');
  if (!configFile?.content) return null;
  try {
    const config = JSON.parse(configFile.content);
    const candidates = [
      config?.environment?.sky?.day,
      config?.environment?.sky?.night,
      config?.environment?.sky?.url,
      ...(Object.values(config?.assets?.images || {}) || []),
    ].filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url.trim()));
    return candidates[0]?.trim() || null;
  } catch (_) {
    return null;
  }
}

async function generateFlatTemplateThumbnail(template) {
  const manifest = template.files_manifest || [];

  if (manifestUsesAFrame(manifest)) {
    const previewUrl = pickFlatTemplatePreviewImageUrl(manifest);
    if (previewUrl) return previewUrl;
  }

  const html = buildPreviewDocumentFromManifest(manifest);
  const screenshot = await captureHtmlScreenshot(html);

  if (screenshot && screenshot.length) {
    return uploadThumbnailBuffer(screenshot, template.slug, 'image/jpeg', '.jpg');
  }

  return uploadThumbnailBuffer(
    buildPlaceholderSvg(template.title),
    template.slug,
    'image/svg+xml',
    '.svg'
  );
}

async function generatePlaygroundThumbnail(template, options = {}) {
  if (!template?.slug) return null;
  let url = null;
  if (template.scope === 'combined' && options.bundleLocalPath) {
    url = await extractThumbnailFromBundleZip(options.bundleLocalPath, template.slug);
  } else if (template.scope === 'combined' && template.bundle_b2_key) {
    const tmpZip = path.join(os.tmpdir(), `pg-bundle-${Date.now()}.zip`);
    try {
      const streamResult = await b2Service.downloadCommonAssetStream(template.bundle_b2_key);
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmpZip);
        streamResult.stream.pipe(out);
        streamResult.stream.on('error', reject);
        out.on('finish', resolve);
        out.on('error', reject);
      });
      url = await extractThumbnailFromBundleZip(tmpZip, template.slug);
    } finally {
      try {
        fs.unlinkSync(tmpZip);
      } catch (_) {}
    }
  } else if (template.scope === 'flat') {
    url = await generateFlatTemplateThumbnail(template);
  } else if (template.scope === 'combined') {
    url = await uploadThumbnailBuffer(
      buildPlaceholderSvg(template.title || template.slug),
      template.slug,
      'image/svg+xml',
      '.svg'
    );
  }
  return url;
}

async function refreshPlaygroundThumbnail(template, options = {}) {
  if (!template?.is_playground) return template;
  if (!options.force && template.thumbnail_url && !options.bundleLocalPath) {
    return template;
  }
  try {
    const thumbnail_url = await generatePlaygroundThumbnail(template, options);
    if (thumbnail_url) {
      const templatesDb = require('./templates');
      return templatesDb.updateTemplate(template.id, { thumbnail_url });
    }
  } catch (err) {
    console.warn('Playground thumbnail generation failed:', err.message);
  }
  return template;
}

module.exports = {
  playgroundThumbKey,
  playgroundThumbRemotePath,
  playgroundThumbLegacyRemotePath,
  playgroundThumbLookupPaths,
  playgroundThumbServeUrl,
  parsePlaygroundThumbnailSlug,
  getCanonicalPlaygroundThumbPath,
  resolvePlaygroundThumbnailUrl,
  contentTypeForThumbPath,
  extractThumbnailFromBundleZip,
  generateFlatTemplateThumbnail,
  generatePlaygroundThumbnail,
  refreshPlaygroundThumbnail,
  uploadCustomTemplateThumbnail,
  buildPlaceholderSvg,
  manifestUsesAFrame,
  pickFlatTemplatePreviewImageUrl,
};
