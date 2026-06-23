const fs = require('fs');
const path = require('path');
const { getContentType, sanitizeFilename } = require('./common-assets');
const { isTranscodeEnabledFor } = require('./video-config');
const { transcode360Video, isFfmpegAvailable } = require('./video-transcode');

const VIDEO_CATEGORY = '360-videos';

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

  if (category !== VIDEO_CATEGORY || !isTranscodeEnabledFor(context)) {
    return passthrough;
  }

  if (!isFfmpegAvailable()) {
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
    console.error('Video transcode failed; storing original upload:', err.message);
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
  prepareVideoForStorage,
  cleanupTempFiles,
  buildStoredVideoFilename,
};
