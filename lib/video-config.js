const { isFfmpegAvailable } = require('./video-transcode');

function envBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  return value === 'true' || value === '1';
}

function getVideoPipelineConfig() {
  const transcodeEnabled = envBool('VIDEO_TRANSCODE_ENABLED', false);
  return {
    transcodeEnabled,
    adminOnly: envBool('VIDEO_TRANSCODE_ADMIN_ONLY', true),
    sceneServerUpload: envBool('VIDEO_SCENE_SERVER_UPLOAD', false),
    exportUrlMode: envBool('VIDEO_EXPORT_URL_MODE', false),
    ffmpegAvailable: isFfmpegAvailable(),
  };
}

function isTranscodeEnabledFor(context) {
  const cfg = getVideoPipelineConfig();
  if (!cfg.transcodeEnabled) return false;
  if (cfg.adminOnly) return context === 'admin-common' || context === 'editor-local';
  return ['admin-common', 'student-asset', 'scene-video', 'editor-local'].includes(context);
}

module.exports = {
  getVideoPipelineConfig,
  isTranscodeEnabledFor,
};
