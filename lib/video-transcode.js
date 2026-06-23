const fs = require('fs');
const path = require('path');
const os = require('os');

const TRANSCODE_TIMEOUT_MS = 10 * 60 * 1000;

let ffmpegPath = null;
let fluentFfmpeg = null;

function getFfmpegPath() {
  if (!ffmpegPath) {
    const installer = require('@ffmpeg-installer/ffmpeg');
    ffmpegPath = installer.path;
  }
  return ffmpegPath;
}

function getFluentFfmpeg() {
  if (!fluentFfmpeg) {
    fluentFfmpeg = require('fluent-ffmpeg');
    fluentFfmpeg.setFfmpegPath(getFfmpegPath());
  }
  return fluentFfmpeg;
}

function isFfmpegAvailable() {
  try {
    const ffmpegBinary = getFfmpegPath();
    return Boolean(ffmpegBinary && fs.existsSync(ffmpegBinary));
  } catch (_) {
    return false;
  }
}

function transcode360Video(inputPath) {
  const originalSize = fs.statSync(inputPath).size;
  const outputPath = path.join(
    os.tmpdir(),
    `vr-hotspot-transcoded_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`
  );

  const ffmpeg = getFluentFfmpeg();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) return reject(err);
      resolve(result);
    };

    const command = ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-crf 28',
        '-preset fast',
        '-vf scale=3840:1920:force_original_aspect_ratio=decrease',
        '-movflags +faststart',
      ])
      .on('end', () => {
        try {
          const size = fs.statSync(outputPath).size;
          if (inputPath !== outputPath) {
            try {
              fs.unlinkSync(inputPath);
            } catch (_) {}
          }
          finish(null, {
            path: outputPath,
            size,
            transcoded: true,
            originalSize,
            contentType: 'video/mp4',
          });
        } catch (err) {
          finish(err);
        }
      })
      .on('error', (err) => finish(err))
      .save(outputPath);

    const timer = setTimeout(() => {
      try {
        command.kill('SIGKILL');
      } catch (_) {}
      finish(new Error('Video transcoding timed out'));
    }, TRANSCODE_TIMEOUT_MS);
  });
}

module.exports = {
  transcode360Video,
  isFfmpegAvailable,
};
