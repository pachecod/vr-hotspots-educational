const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const b2Service = require('../services/b2-service');
const { isFfmpegAvailable } = require('./video-transcode');
const { buildPreviewDocumentFromManifest } = require('./flat-preview-document');
const { captureHtmlScreenshot } = require('./page-screenshot');

function playgroundThumbKey(slug, ext = '.jpg') {
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `playground-thumbs/${slug}${safeExt}`;
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPlaceholderSvg(title) {
  const label = escapeXml(title || 'VR Hotspot Sample');
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

async function uploadThumbnailFile(localPath, slug, contentType) {
  const ext = path.extname(localPath) || '.jpg';
  const remotePath = playgroundThumbKey(slug, ext);
  await b2Service.ensureCommonAssetsBucket();
  await b2Service.uploadCommonAsset(localPath, remotePath, contentType);
  if (b2Service.commonAssetsPublicAccess) {
    return b2Service.getCommonAssetPublicUrl(remotePath);
  }
  return await b2Service.getCommonAssetAccessUrl(remotePath);
}

async function uploadThumbnailBuffer(buffer, slug, contentType, ext) {
  const tmp = path.join(os.tmpdir(), `pg-thumb-${Date.now()}${ext}`);
  fs.writeFileSync(tmp, buffer);
  try {
    return await uploadThumbnailFile(tmp, slug, contentType);
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

async function generateFlatTemplateThumbnail(template) {
  const manifest = template.files_manifest || [];
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
  extractThumbnailFromBundleZip,
  generateFlatTemplateThumbnail,
  generatePlaygroundThumbnail,
  refreshPlaygroundThumbnail,
  buildPlaceholderSvg,
};
