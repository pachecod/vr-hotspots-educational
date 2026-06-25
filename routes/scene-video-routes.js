const path = require('path');
const fs = require('fs');
const b2Service = require('../services/b2-service');
const { requireStudentStrict } = require('../student-auth');
const { query } = require('../services/db-service');
const {
  getExtension,
  isExtensionAllowedForCategory,
  FILE_SIZE_LIMITS,
  getContentType,
} = require('../lib/common-assets');
const { assertCanUploadAsset } = require('../services/usage-quota');
const { getVideoPipelineConfig } = require('../lib/video-config');
const { prepareVideoForStorage, cleanupTempFiles, VIDEO_CATEGORY } = require('../lib/video-pipeline');
const { buildStudentAssetPath } = require('./student-assets-routes');
const { isTranscodeEnabledFor } = require('../lib/video-config');
const { isFfmpegAvailable } = require('../lib/video-transcode');
const {
  createUploadJob,
  updateUploadJob,
  getUploadJob,
  completeUploadJob,
  failUploadJob,
  deleteUploadJob,
} = require('../lib/video-upload-jobs');

async function getStudentContext(studentId) {
  const { rows } = await query(
    `SELECT s.id, s.class_id, c.slug AS class_slug
     FROM students s JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND s.is_active = TRUE`,
    [studentId]
  );
  return rows[0] || null;
}

function getServerBaseUrl(req) {
  if (process.env.SERVER_BASE_URL) return process.env.SERVER_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
    : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function buildSceneVideoFilename(originalName) {
  const ext = getExtension(originalName) || 'mp4';
  return `scene-${Date.now()}.${ext}`;
}

function canCompressEditorLocalVideo() {
  return isTranscodeEnabledFor('editor-local') && isFfmpegAvailable();
}

async function runEditorLocalVideoCompressionJob(jobId, { tempPath, originalName, originalSize }) {
  const cleanupPaths = [tempPath];
  try {
    updateUploadJob(jobId, {
      phase: 'transcoding',
      transcodePercent: 0,
      message: 'Compressing video…',
    });

    const prepared = await prepareVideoForStorage({
      tempPath,
      originalName,
      category: VIDEO_CATEGORY,
      context: 'editor-local',
      onProgress: (pct) => {
        updateUploadJob(jobId, {
          phase: 'transcoding',
          transcodePercent: pct,
          message: pct > 0 ? `Compressing video… ${pct}%` : 'Compressing video…',
        });
      },
    });

    if (prepared.path !== tempPath) {
      cleanupPaths.length = 0;
    }

    const filename = prepared.storedFilename || buildSceneVideoFilename(originalName);
    completeUploadJob(jobId, {
      filename,
      size: prepared.size,
      originalSize: prepared.originalSize || originalSize,
      transcoded: Boolean(prepared.transcoded),
      transcodeError: prepared.transcodeError || null,
      contentType: prepared.contentType || getContentType(filename),
      downloadUrl: `/api/editor-video/compression-jobs/${encodeURIComponent(jobId)}/file`,
      tempPath: prepared.path,
    });
  } catch (err) {
    console.error('Editor local video compression job error:', err);
    failUploadJob(jobId, err.message || 'Video compression failed');
    cleanupTempFiles(cleanupPaths);
  }
}

function registerSceneVideoRoutes(app, upload) {
  app.get('/api/app-config', (req, res) => {
    const videoPipeline = getVideoPipelineConfig();
    res.json({
      success: true,
      videoPipeline: {
        videoSceneServerUpload: videoPipeline.sceneServerUpload,
        videoExportUrlMode: videoPipeline.exportUrlMode,
        transcodeEnabled: videoPipeline.transcodeEnabled,
        editorLocalVideoCompression: canCompressEditorLocalVideo(),
      },
    });
  });

  app.get('/api/video-pipeline/status', (req, res) => {
    res.json({ success: true, ...getVideoPipelineConfig() });
  });

  app.get('/api/editor-video/compression-jobs/:jobId', (req, res) => {
    const job = getUploadJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Video compression job not found' });
    }
    const asset = job.asset
      ? {
          filename: job.asset.filename,
          size: job.asset.size,
          originalSize: job.asset.originalSize,
          transcoded: Boolean(job.asset.transcoded),
          transcodeError: job.asset.transcodeError || null,
          contentType: job.asset.contentType,
          downloadUrl: job.asset.downloadUrl,
        }
      : null;
    return res.json({
      success: true,
      jobId: job.id,
      phase: job.phase,
      transcodePercent: job.transcodePercent,
      message: job.message,
      fileName: job.fileName,
      category: job.category,
      asset,
      error: job.error,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
    });
  });

  app.get('/api/editor-video/compression-jobs/:jobId/file', (req, res) => {
    const job = getUploadJob(req.params.jobId);
    const asset = job && job.asset;
    if (!asset || !asset.tempPath) {
      return res.status(404).send('Compressed video not found');
    }

    const filePath = asset.tempPath;
    res.setHeader('Content-Type', asset.contentType || 'video/mp4');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${path.basename(asset.filename || 'video.mp4').replace(/"/g, '')}"`
    );
    res.sendFile(path.resolve(filePath), () => {
      cleanupTempFiles([filePath]);
      deleteUploadJob(req.params.jobId);
    });
  });

  app.post('/api/editor-video/compress', upload.single('file'), async (req, res) => {
    const tempPath = req.file && req.file.path;
    const cleanupPaths = tempPath ? [tempPath] : [];
    try {
      if (!canCompressEditorLocalVideo()) {
        return res.status(409).json({
          success: false,
          message: 'Editor video compression is not enabled on this server.',
        });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const ext = getExtension(req.file.originalname);
      if (!isExtensionAllowedForCategory(ext, VIDEO_CATEGORY)) {
        return res.status(400).json({ success: false, message: 'File type not allowed for video' });
      }

      const limit = FILE_SIZE_LIMITS[VIDEO_CATEGORY];
      if (req.file.size > limit) {
        return res.status(400).json({ success: false, message: 'File too large for video compression' });
      }

      const job = createUploadJob({
        fileName: req.file.originalname,
        category: VIDEO_CATEGORY,
      });
      const ownedTempPath = tempPath;
      cleanupPaths.length = 0;
      setImmediate(() => {
        runEditorLocalVideoCompressionJob(job.id, {
          tempPath: ownedTempPath,
          originalName: req.file.originalname,
          originalSize: req.file.size,
        });
      });

      return res.json({
        success: true,
        async: true,
        jobId: job.id,
        fileName: req.file.originalname,
      });
    } catch (err) {
      console.error('Editor local video compression upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Video compression upload failed' });
    } finally {
      cleanupTempFiles(cleanupPaths);
    }
  });

  app.post(
    '/api/scene-video/upload',
    requireStudentStrict,
    upload.single('file'),
    async (req, res) => {
      const tempPath = req.file && req.file.path;
      const cleanupPaths = tempPath ? [tempPath] : [];

      try {
        if (!getVideoPipelineConfig().sceneServerUpload) {
          return res.status(403).json({
            success: false,
            message: 'Scene video server upload is not enabled on this server.',
          });
        }

        if (!req.file) {
          return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const ext = getExtension(req.file.originalname);
        if (!isExtensionAllowedForCategory(ext, VIDEO_CATEGORY)) {
          return res.status(400).json({ success: false, message: 'File type not allowed for 360° video' });
        }

        const limit = FILE_SIZE_LIMITS[VIDEO_CATEGORY];
        if (req.file.size > limit) {
          return res.status(400).json({ success: false, message: 'File too large for 360° video' });
        }

        const studentId = req.studentSession.studentId;
        const ctx = await getStudentContext(studentId);
        if (!ctx) return res.status(401).json({ success: false, message: 'Student not found' });

        const prepared = await prepareVideoForStorage({
          tempPath,
          originalName: req.file.originalname,
          category: VIDEO_CATEGORY,
          context: 'scene-video',
        });

        if (prepared.path !== tempPath) {
          cleanupPaths.push(prepared.path);
        }

        await assertCanUploadAsset({
          classId: ctx.class_id,
          studentId,
          additionalBytes: prepared.size,
        });

        const storedFilename = prepared.storedFilename || buildSceneVideoFilename(req.file.originalname);
        const b2Path = buildStudentAssetPath(
          ctx.class_slug,
          studentId,
          VIDEO_CATEGORY,
          storedFilename
        );
        const contentType = prepared.contentType || getContentType(storedFilename);

        await b2Service.uploadFile(prepared.path, b2Path, contentType);

        const proxyUrl = `/api/scene-video/${encodeURIComponent(storedFilename)}`;
        const url = `${getServerBaseUrl(req)}${proxyUrl}`;

        res.json({
          success: true,
          filename: storedFilename,
          url,
          proxyUrl,
          b2Path,
          size: prepared.size,
          originalSize: prepared.originalSize || req.file.size,
          transcoded: Boolean(prepared.transcoded),
          transcodeError: prepared.transcodeError || null,
          contentType,
        });
      } catch (err) {
        if (err.statusCode === 402) {
          return res.status(402).json({ success: false, ...err.payload });
        }
        console.error('Scene video upload error:', err);
        res.status(500).json({ success: false, message: err.message || 'Upload failed' });
      } finally {
        cleanupTempFiles(cleanupPaths);
      }
    }
  );

  app.get('/api/scene-video/:filename', requireStudentStrict, async (req, res) => {
    const tempPath = path.join('temp-uploads', `scene_${Date.now()}_${req.params.filename}`);
    try {
      const studentId = req.studentSession.studentId;
      const ctx = await getStudentContext(studentId);
      if (!ctx) return res.status(401).send('Unauthorized');

      const filename = path.basename(req.params.filename);
      const b2Path = buildStudentAssetPath(
        ctx.class_slug,
        studentId,
        VIDEO_CATEGORY,
        filename
      );

      await b2Service.downloadFile(b2Path, tempPath);
      res.setHeader('Content-Type', getContentType(filename));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.sendFile(path.resolve(tempPath), () => {
        cleanupTempFiles([tempPath]);
      });
    } catch (err) {
      cleanupTempFiles([tempPath]);
      console.error('Stream scene video error:', err);
      res.status(404).send('Video not found');
    }
  });
}

module.exports = { registerSceneVideoRoutes };
