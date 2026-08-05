const fs = require('fs');
const path = require('path');
const { getContentType, getExtension, sanitizeFilename } = require('./common-assets');
const { isTranscodeEnabledFor } = require('./video-config');
const { transcode360Video, isFfmpegAvailable } = require('./video-transcode');

const VIDEO_CATEGORY = '360-videos';
const FLAT_VIDEO_CATEGORY = 'videos';
const VIDEO_CATEGORIES = new Set([VIDEO_CATEGORY, FLAT_VIDEO_CATEGORY]);

function isMovUpload(originalName) {
  return getExtension(originalName) === 'mov';
}

function isVideoCategory(category) {
  return VIDEO_CATEGORIES.has(category);
}

/**
 * .mov must be converted to MP4 for browser/A-Frame playback.
 * Compression for other formats remains gated by VIDEO_TRANSCODE_* flags.
 */
function shouldPrepareVideo({ category, context, originalName }) {
  if (!isVideoCategory(category)) return false;
  if (isMovUpload(originalName)) return true;
  return category === VIDEO_CATEGORY && isTranscodeEnabledFor(context);
}

function buildStoredVideoFilename(originalName, transcoded) {
  if (transcoded) {
    const base = path.basename(originalName, path.extname(originalName)) || 'video';
    return sanitizeFilename(`${base}.mp4`) || `video_${Date.now()}.mp4`;
  }
  return sanitizeFilename(originalName);
}

async function prepareVideoForStorage({ tempPath, originalName, category, context, onProgress }) {
  const originalSize = fs.statSync(tempPath).size;
  const passthrough = {
    path: tempPath,
    size: originalSize,
    transcoded: false,
    originalSize,
    storedFilename: buildStoredVideoFilename(originalName, false),
    contentType: getContentType(originalName),
  };

  const needsMovConversion = isMovUpload(originalName);
  if (!shouldPrepareVideo({ category, context, originalName })) {
    return passthrough;
  }

  if (!isFfmpegAvailable()) {
    if (needsMovConversion) {
      throw new Error(
        'QuickTime (.mov) uploads require conversion to MP4, but FFmpeg is unavailable on this server.'
      );
    }
    console.warn('VIDEO_TRANSCODE_ENABLED but FFmpeg binary is unavailable; storing raw upload');
    return passthrough;
  }

  try {
    const result = await transcode360Video(tempPath, { onProgress });
    return {
      ...result,
      storedFilename: buildStoredVideoFilename(originalName, true),
      contentType: 'video/mp4',
    };
  } catch (err) {
    if (needsMovConversion) {
      throw new Error(
        `Could not convert QuickTime (.mov) to MP4: ${err.message || 'transcode failed'}`
      );
    }
    console.error('Video transcode failed; storing original upload:', err.message);
    try {
      const { logAppError } = require('./error-log');
      logAppError({
        level: 'warning',
        code: 'video_transcode_store_original',
        message: err.message || 'Video transcode failed; storing original',
        source: 'video-pipeline',
        details: { originalName, needsMovConversion: Boolean(needsMovConversion) },
      });
    } catch (_) {
      /* ignore */
    }
    return {
      ...passthrough,
      transcodeError: err.message,
    };
  }
}

function cleanupTempFiles(paths) {
  const unique = [...new Set((paths || []).filter(Boolean))];
  for (const filePath of unique) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
  }
}

module.exports = {
  VIDEO_CATEGORY,
  FLAT_VIDEO_CATEGORY,
  isMovUpload,
  isVideoCategory,
  shouldPrepareVideo,
  prepareVideoForStorage,
  cleanupTempFiles,
  buildStoredVideoFilename,
};
