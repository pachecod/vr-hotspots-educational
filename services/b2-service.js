require('dotenv').config();
const B2 = require('backblaze-b2');
const fs = require('fs');
const path = require('path');

function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// Backblaze credentials from environment variables (trim — Render paste often adds whitespace)
const B2_KEY_ID = trimEnv(process.env.B2_KEY_ID);
const B2_APP_KEY = trimEnv(process.env.B2_APP_KEY);
const B2_BUCKET_NAME = trimEnv(process.env.B2_BUCKET_NAME);
const B2_BUCKET_ID = trimEnv(process.env.B2_BUCKET_ID);

// Validate required environment variables (defer hard failure until first B2 use)
const B2_CONFIGURED = !!(B2_KEY_ID && B2_APP_KEY && B2_BUCKET_NAME);
if (!B2_CONFIGURED) {
  console.warn('⚠️  B2 not configured (B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME).');
  console.warn('   Server will start, but uploads/submissions/common-assets need B2 in .env');
}

class B2Service {
  constructor() {
    this.b2 = new B2({
      applicationKeyId: B2_KEY_ID,
      applicationKey: B2_APP_KEY,
    });
    this.authorized = false;
    this.bucketId = null;
    this.downloadUrl = null;
    this.accountId = null;
    this.lastAuthorizedAtMs = 0;
    this.commonAssetsBucketId = null;
    this.commonAssetsBucketName = null;
    this.commonAssetsDownloadUrl = null;
    this.commonAssetsBucketReady = false;
    this.commonAssetsPublicAccess = false;
    this._commonAssetsMigrationDone = false;
    this._commonAssetsPrefixAuth = null;
    this._commonAssetsPrefixAuthExpiresAt = 0;
  }

  invalidateCommonAssetsCaches() {
    this._commonAssetsPrefixAuth = null;
    this._commonAssetsPrefixAuthExpiresAt = 0;
  }

  _isExpiredAuthTokenError(err) {
    const code = err && err.response && err.response.data && err.response.data.code;
    const status = err && err.response && err.response.status;
    return status === 401 && (code === 'expired_auth_token' || code === 'bad_auth_token');
  }

  _isBadBucketIdError(err) {
    const status = err && err.response && err.response.status;
    const message = (err && err.response && err.response.data && err.response.data.message) || '';
    return status === 400 && /bucket/i.test(String(message));
  }

  formatError(err) {
    const data = err && err.response && err.response.data;
    if (data && data.message) {
      return data.message;
    }
    return err && err.message ? err.message : 'Unknown B2 error';
  }

  async _resolveBucketByName(bucketName) {
    const bucketResponse = await this.b2.getBucket({ bucketName });
    const bucket = bucketResponse.data.buckets && bucketResponse.data.buckets[0];
    if (bucket) {
      this.bucketId = bucket.bucketId;
      this.downloadUrl = bucket.downloadUrl || this.b2.downloadUrl;
      console.log(`✅ Using existing bucket: ${bucketName}`);
      console.log(`   Bucket ID: ${this.bucketId}`);
      return true;
    }

    console.log(`   Bucket "${bucketName}" not found via API, creating...`);
    try {
      const createResponse = await this.b2.createBucket({
        bucketName,
        bucketType: 'allPrivate',
      });
      this.bucketId = createResponse.data.bucketId;
      this.downloadUrl = createResponse.data.downloadUrl || this.b2.downloadUrl;
      console.log(`✅ Created new bucket: ${bucketName}`);
      console.log(`   Bucket ID: ${this.bucketId}`);
      return true;
    } catch (createErr) {
      if (createErr.response && createErr.response.data && createErr.response.data.code === 'duplicate_bucket_name') {
        throw new Error(
          `Bucket "${bucketName}" exists but could not be resolved. ` +
            'Open Backblaze B2 → Buckets → your bucket → Bucket Settings, copy the Bucket ID, ' +
            'and add B2_BUCKET_ID=... to .env. Or use a new bucket name in B2_BUCKET_NAME (e.g. hotspot-vr).'
        );
      }
      throw createErr;
    }
  }

  async _validateBucketId(bucketId) {
    try {
      await this.b2.listFileNames({
        bucketId,
        maxFileCount: 1,
        startFileName: '',
      });
      return true;
    } catch (err) {
      if (this._isBadBucketIdError(err)) return false;
      throw err;
    }
  }

  async _withReauthRetry(actionName, fn) {
    try {
      return await fn();
    } catch (err) {
      if (!this._isExpiredAuthTokenError(err)) throw err;
      console.warn(`⚠️ B2 token expired during ${actionName}; re-authorizing and retrying once...`);
      this.authorized = false;
      this.bucketId = null;
      this.downloadUrl = null;
      this.lastAuthorizedAtMs = 0;
      await this.authorize({ force: true });
      return await fn();
    }
  }

  async authorize({ force = false } = {}) {
    const bucketName = (process.env.B2_BUCKET_NAME || B2_BUCKET_NAME || '').trim();
    const bucketIdFromEnv = (process.env.B2_BUCKET_ID || B2_BUCKET_ID || '').trim();

    if (!B2_KEY_ID || !B2_APP_KEY || !bucketName) {
      throw new Error('Backblaze B2 is not configured. Add B2_KEY_ID, B2_APP_KEY, and B2_BUCKET_NAME to .env');
    }
    // Backblaze account authorization tokens expire; refresh periodically.
    const MAX_AUTH_AGE_MS = 23 * 60 * 60 * 1000;
    const authAgeMs = this.lastAuthorizedAtMs ? Date.now() - this.lastAuthorizedAtMs : Infinity;
    if (!force && this.authorized && authAgeMs < MAX_AUTH_AGE_MS && this.bucketId) return;

    try {
      await this.b2.authorize();
      this.authorized = true;
      this.lastAuthorizedAtMs = Date.now();
      this.accountId = this.b2.accountId;
      console.log('✅ Backblaze B2 authorized');

      if (bucketIdFromEnv) {
        const bucketIdValid = await this._validateBucketId(bucketIdFromEnv);
        if (bucketIdValid) {
          this.bucketId = bucketIdFromEnv;
          this.downloadUrl = this.b2.downloadUrl;
          console.log(`✅ Using bucket ID from env: ${this.bucketId} (${bucketName})`);
          return;
        }
        console.warn(
          `⚠️ B2_BUCKET_ID "${bucketIdFromEnv}" is invalid for this account; resolving bucket by name "${bucketName}" instead.`
        );
      }

      await this._resolveBucketByName(bucketName);

      // Guard: if bucketId is still null after resolution, fail fast
      if (!this.bucketId) {
        throw new Error('Failed to resolve bucketId after authorization');
      }
    } catch (err) {
      this.authorized = false;
      this.bucketId = null;
      console.error('❌ Backblaze authorization failed:', err.message);
      if (err.response && err.response.data) {
        console.error('   B2 Error details:', JSON.stringify(err.response.data, null, 2));
      }
      const b2Code = err.response && err.response.data && err.response.data.code;
      if (err.response && err.response.status === 401) {
        throw new Error(
          'B2 credentials rejected (401). In Backblaze, create a new Application Key and copy both the ' +
            'Application Key ID → B2_KEY_ID and the secret (shown once) → B2_APP_KEY. ' +
            'Ensure the key has read/write access to bucket "' +
            B2_BUCKET_NAME +
            '".'
        );
      }
      if (b2Code === 'bad_auth_token') {
        throw new Error(
          'B2 bad_auth_token: Application Key ID and secret do not match. Regenerate the key in Backblaze and update .env.'
        );
      }
      throw new Error(`B2 Authorization failed: ${err.message}`);
    }
  }

  async uploadFile(localPath, remotePath, contentType = 'application/zip') {
    await this.authorize();

    try {
      const stat = fs.statSync(localPath);
      const fileSize = stat.size;
      const fileStream = fs.createReadStream(localPath);
      const uploadUrlResponse = await this._withReauthRetry('getUploadUrl', async () =>
        this.b2.getUploadUrl({
          bucketId: this.bucketId,
        })
      );

      const uploadResponse = await this._withReauthRetry('uploadFile', async () =>
        this.b2.uploadFile({
          uploadUrl: uploadUrlResponse.data.uploadUrl,
          uploadAuthToken: uploadUrlResponse.data.authorizationToken,
          fileName: remotePath,
          data: fileStream,
          contentLength: fileSize,
          hash: 'do_not_verify',
          mime: contentType,
          axios: {
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          },
        })
      );

      console.log(`✅ Uploaded to B2: ${remotePath}`);
      console.log(`   File ID: ${uploadResponse.data.fileId}`);
      console.log(`   Size: ${uploadResponse.data.contentLength} bytes`);

      // Verify the upload by checking if file exists
      try {
        const verifyResponse = await this._withReauthRetry('listFileNames(verify upload)', async () =>
          this.b2.listFileNames({
            bucketId: this.bucketId,
            startFileName: remotePath,
            maxFileCount: 1,
          })
        );

        if (
          verifyResponse.data.files.length > 0 &&
          verifyResponse.data.files[0].fileName === remotePath
        ) {
          console.log(`✅ Upload verified - file exists in bucket`);
        } else {
          console.warn(`⚠️ Upload completed but file not found in bucket listing`);
        }
      } catch (verifyErr) {
        console.warn(`⚠️ Could not verify upload:`, verifyErr.message);
      }

      return uploadResponse.data;
    } catch (err) {
      console.error(`❌ Upload failed for ${remotePath}:`, err.message);
      console.error('Full error:', err);
      throw new Error(`Upload failed: ${err.message}`);
    }
  }

  async getUploadUrl() {
    await this.authorize();
    try {
      const uploadUrlResponse = await this._withReauthRetry('getUploadUrl', async () =>
        this.b2.getUploadUrl({
          bucketId: this.bucketId,
        })
      );
      return uploadUrlResponse.data;
    } catch (err) {
      console.error('❌ getUploadUrl failed:', err.message);
      throw err;
    }
  }

  async downloadFile(remotePath, localPath) {
    await this.authorize();

    try {
      const downloadResponse = await this._withReauthRetry('downloadFileByName', async () =>
        this.b2.downloadFileByName({
          bucketName: B2_BUCKET_NAME,
          fileName: remotePath,
          responseType: 'stream',
          axios: {
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          },
        })
      );

      // Ensure directory exists
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Stream to disk to avoid buffering large files in memory
      const stream = require('stream');
      const { promisify } = require('util');
      const pipeline = promisify(stream.pipeline);
      await pipeline(downloadResponse.data, fs.createWriteStream(localPath));
      console.log(`✅ Downloaded from B2: ${remotePath}`);
      return localPath;
    } catch (err) {
      console.error(`Download failed for ${remotePath}:`, err.message);
      throw err;
    }
  }

  async deleteFile(remotePath) {
    await this.authorize();

    try {
      // First get file info to get file ID
      const fileListResponse = await this._withReauthRetry('listFileNames(delete)', async () =>
        this.b2.listFileNames({
          bucketId: this.bucketId,
          startFileName: remotePath,
          maxFileCount: 1,
        })
      );

      if (fileListResponse.data.files.length === 0) {
        console.log(`⚠️ File not found on B2: ${remotePath}`);
        return;
      }

      // Verify exact match (not just prefix)
      const file = fileListResponse.data.files[0];
      if (file.fileName !== remotePath) {
        console.log(`⚠️ File not found on B2 (got ${file.fileName} instead): ${remotePath}`);
        return;
      }

      await this._withReauthRetry('deleteFileVersion', async () =>
        this.b2.deleteFileVersion({
          fileId: file.fileId,
          fileName: file.fileName,
        })
      );

      console.log(`✅ Deleted from B2: ${remotePath}`);
    } catch (err) {
      console.error(`❌ Delete failed for ${remotePath}:`, err.message);
      throw err;
    }
  }

  async listFiles(prefix = '', options = {}) {
    await this.authorize();
    const maxFileCount = options.maxFileCount || 10000;
    const startFileName = options.startFileName || prefix;

    try {
      const response = await this._withReauthRetry('listFileNames(list)', async () =>
        this.b2.listFileNames({
          bucketId: this.bucketId,
          prefix: prefix,
          startFileName,
          maxFileCount,
        })
      );

      return response.data.files;
    } catch (err) {
      console.error('❌ List files failed:', err.message);
      throw err;
    }
  }

  async getFileInfo(remotePath) {
    await this.authorize();

    const response = await this._withReauthRetry('listFileNames(getFileInfo)', async () =>
      this.b2.listFileNames({
        bucketId: this.bucketId,
        startFileName: remotePath,
        maxFileCount: 1,
      })
    );

    const file = response.data.files[0];
    if (!file || file.fileName !== remotePath) {
      return null;
    }
    return file;
  }

  async uploadBuffer(buffer, remotePath, contentType = 'application/octet-stream') {
    await this.authorize();

    try {
      const uploadUrlResponse = await this._withReauthRetry('getUploadUrl', async () =>
        this.b2.getUploadUrl({
          bucketId: this.bucketId,
        })
      );

      const uploadResponse = await this._withReauthRetry('uploadBuffer', async () =>
        this.b2.uploadFile({
          uploadUrl: uploadUrlResponse.data.uploadUrl,
          uploadAuthToken: uploadUrlResponse.data.authorizationToken,
          fileName: remotePath,
          data: buffer,
          contentLength: buffer.length,
          hash: 'do_not_verify',
          mime: contentType,
        })
      );

      console.log(`✅ Uploaded buffer to B2: ${remotePath}`);
      return uploadResponse.data;
    } catch (err) {
      console.error(`❌ Buffer upload failed for ${remotePath}:`, err.message);
      throw new Error(`Upload failed: ${err.message}`);
    }
  }

  async downloadStream(remotePath, options = {}) {
    await this.authorize();

    const axiosConfig = {
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      responseType: 'stream',
    };

    if (options.range) {
      axiosConfig.headers = { Range: options.range };
    }

    const downloadResponse = await this._withReauthRetry('downloadFileByName(stream)', async () =>
      this.b2.downloadFileByName({
        bucketName: B2_BUCKET_NAME,
        fileName: remotePath,
        responseType: 'stream',
        axios: axiosConfig,
      })
    );

    return {
      stream: downloadResponse.data,
      statusCode: downloadResponse.status || 200,
      headers: downloadResponse.headers || {},
    };
  }

  async getDownloadAuthorization(remotePath, validDurationInSeconds = 3600) {
    await this.authorize();

    try {
      const authResponse = await this._withReauthRetry('getDownloadAuthorization', async () =>
        this.b2.getDownloadAuthorization({
          bucketId: this.bucketId,
          fileNamePrefix: remotePath,
          validDurationInSeconds: validDurationInSeconds,
        })
      );

      const downloadUrl = `${this.downloadUrl}/file/${B2_BUCKET_NAME}/${remotePath}?Authorization=${authResponse.data.authorizationToken}`;
      return downloadUrl;
    } catch (err) {
      console.error('❌ Download authorization failed:', err.message);
      throw err;
    }
  }

  _getCommonAssetsBucketName() {
    const privateName = (process.env.B2_BUCKET_NAME || B2_BUCKET_NAME || '').trim();
    return (process.env.B2_PUBLIC_BUCKET_NAME || `${privateName}-public`).trim();
  }

  _encodeB2FilePath(remotePath) {
    return remotePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  }

  getCommonAssetPublicUrl(remotePath) {
    if (!this.commonAssetsBucketName) {
      throw new Error('Common assets bucket is not initialized');
    }
    const base = (this.commonAssetsDownloadUrl || this.downloadUrl || this.b2.downloadUrl).replace(/\/$/, '');
    return `${base}/file/${this.commonAssetsBucketName}/${this._encodeB2FilePath(remotePath)}`;
  }

  buildCommonAssetAccessUrl(remotePath, authorizationToken) {
    if (this.commonAssetsPublicAccess) {
      return this.getCommonAssetPublicUrl(remotePath);
    }
    const base = (this.commonAssetsDownloadUrl || this.downloadUrl || this.b2.downloadUrl).replace(/\/$/, '');
    return `${base}/file/${this.commonAssetsBucketName}/${this._encodeB2FilePath(remotePath)}?Authorization=${encodeURIComponent(authorizationToken)}`;
  }

  async getCommonAssetsPrefixAuthorization() {
    await this.ensureCommonAssetsBucket();
    if (this.commonAssetsPublicAccess) return null;

    const now = Date.now();
    if (this._commonAssetsPrefixAuth && now < this._commonAssetsPrefixAuthExpiresAt) {
      return this._commonAssetsPrefixAuth;
    }

    const authResponse = await this._withReauthRetry('getDownloadAuthorization(common assets prefix)', async () =>
      this.b2.getDownloadAuthorization({
        bucketId: this.commonAssetsBucketId,
        fileNamePrefix: 'common-assets/',
        validDurationInSeconds: 604800,
      })
    );

    this._commonAssetsPrefixAuth = authResponse.data.authorizationToken;
    this._commonAssetsPrefixAuthExpiresAt = now + 23 * 60 * 60 * 1000;
    return this._commonAssetsPrefixAuth;
  }

  async getCommonAssetAccessUrl(remotePath) {
    await this.ensureCommonAssetsBucket();
    if (this.commonAssetsPublicAccess) {
      return this.getCommonAssetPublicUrl(remotePath);
    }

    const token = await this.getCommonAssetsPrefixAuthorization();
    return this.buildCommonAssetAccessUrl(remotePath, token);
  }

  _usePrivateBucketForCommonAssets() {
    this.commonAssetsBucketId = this.bucketId;
    this.commonAssetsBucketName = (process.env.B2_BUCKET_NAME || B2_BUCKET_NAME || '').trim();
    this.commonAssetsDownloadUrl = this.downloadUrl || this.b2.downloadUrl;
    this.commonAssetsPublicAccess = false;
  }

  async ensureCommonAssetsBucket() {
    await this.authorize();

    if (this.commonAssetsBucketReady && this.commonAssetsBucketId) {
      return;
    }

    const bucketName = this._getCommonAssetsBucketName();
    const bucketIdFromEnv = (process.env.B2_PUBLIC_BUCKET_ID || '').trim();
    let configuredPublic = false;

    if (bucketIdFromEnv) {
      this.commonAssetsBucketId = bucketIdFromEnv;
      this.commonAssetsBucketName = bucketName;
      this.commonAssetsDownloadUrl = this.b2.downloadUrl;
      this.commonAssetsPublicAccess = true;
      configuredPublic = true;
      console.log(`✅ Using public common-assets bucket from env: ${bucketName}`);
    } else {
      const bucketResponse = await this.b2.getBucket({ bucketName });
      const bucket = bucketResponse.data.buckets && bucketResponse.data.buckets[0];
      if (bucket) {
        this.commonAssetsBucketId = bucket.bucketId;
        this.commonAssetsBucketName = bucketName;
        this.commonAssetsDownloadUrl = bucket.downloadUrl || this.b2.downloadUrl;
        this.commonAssetsPublicAccess = bucket.bucketType === 'allPublic';
        configuredPublic = this.commonAssetsPublicAccess;
        console.log(
          `✅ Using common-assets bucket: ${bucketName}` +
            (this.commonAssetsPublicAccess ? ' (public)' : ' (private, signed URLs)')
        );
      } else {
        try {
          const createResponse = await this.b2.createBucket({
            bucketName,
            bucketType: 'allPublic',
          });
          this.commonAssetsBucketId = createResponse.data.bucketId;
          this.commonAssetsBucketName = bucketName;
          this.commonAssetsDownloadUrl = createResponse.data.downloadUrl || this.b2.downloadUrl;
          this.commonAssetsPublicAccess = true;
          configuredPublic = true;
          console.log(`✅ Created public common-assets bucket: ${bucketName}`);
          console.log(`   Add to .env: B2_PUBLIC_BUCKET_NAME=${bucketName}`);
          console.log(`   Add to .env: B2_PUBLIC_BUCKET_ID=${this.commonAssetsBucketId}`);
        } catch (createErr) {
          const code = createErr.response && createErr.response.data && createErr.response.data.code;
          if (code === 'no_payment_history' || code === 'duplicate_bucket_name') {
            this._usePrivateBucketForCommonAssets();
            console.log(
              'ℹ️  Public B2 bucket unavailable; common assets use signed Backblaze URLs (7-day expiry). ' +
                'Add payment in Backblaze to enable permanent public URLs via B2_PUBLIC_BUCKET_NAME.'
            );
          } else {
            throw createErr;
          }
        }
      }
    }

    if (configuredPublic && !this.commonAssetsPublicAccess) {
      this._usePrivateBucketForCommonAssets();
      console.log('ℹ️  Configured common-assets bucket is private; using signed Backblaze URLs (7-day expiry).');
    }

    await this.applyCommonAssetsCorsRules();
    this.commonAssetsBucketReady = true;
  }

  async applyCommonAssetsCorsRules() {
    if (!this.commonAssetsBucketId) return;
    if (trimEnv(process.env.B2_SKIP_CORS_UPDATE) === 'true') {
      return;
    }

    const axios = require('axios');
    const corsRules = [
      {
        corsRuleName: 'allowBrowserAccess',
        allowedOrigins: ['*'],
        allowedHeaders: [
          'authorization',
          'content-type',
          'content-length',
          'x-bz-file-name',
          'x-bz-content-sha1',
          'x-bz-info-*',
          'range',
        ],
        allowedOperations: [
          'b2_upload_file',
          'b2_download_file_by_name',
          'b2_download_file_by_id',
          'b2_upload_part',
          's3_put',
          's3_get',
          's3_head',
        ],
        exposeHeaders: [
          'x-bz-content-sha1',
          'x-bz-upload-timestamp',
          'x-bz-file-name',
          'x-bz-file-id',
          'etag',
          'content-length',
          'content-type',
        ],
        maxAgeSeconds: 86400,
      },
    ];

    try {
      if (await this._bucketCorsIsConfigured(this.commonAssetsBucketId, corsRules)) {
        console.log(`ℹ️  CORS already configured on ${this.commonAssetsBucketName}; skipping update`);
        return;
      }

      await axios.post(
        `${this.b2.apiUrl}/b2api/v2/b2_update_bucket`,
        {
          accountId: this.b2.accountId,
          bucketId: this.commonAssetsBucketId,
          corsRules,
        },
        {
          headers: {
            Authorization: this.b2.authorizationToken,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`✅ CORS enabled on common-assets bucket: ${this.commonAssetsBucketName}`);
    } catch (err) {
      const details = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
      console.warn(`⚠️ Could not update CORS on common-assets bucket: ${details}`);
    }
  }

  async _bucketCorsIsConfigured(bucketId, expectedRules) {
    const axios = require('axios');
    try {
      const response = await axios.post(
        `${this.b2.apiUrl}/b2api/v2/b2_get_bucket`,
        {
          accountId: this.b2.accountId,
          bucketId,
        },
        {
          headers: {
            Authorization: this.b2.authorizationToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const existing = response.data && response.data.corsRules;
      if (!Array.isArray(existing) || existing.length === 0) return false;

      const rule = existing.find((entry) => entry.corsRuleName === 'allowBrowserAccess') || existing[0];
      const expected = expectedRules[0];
      if (!rule || !expected) return false;

      const originsOk =
        Array.isArray(rule.allowedOrigins) &&
        rule.allowedOrigins.includes('*');
      const operationsOk =
        Array.isArray(rule.allowedOperations) &&
        expected.allowedOperations.every((op) => rule.allowedOperations.includes(op));

      return originsOk && operationsOk;
    } catch (_) {
      return false;
    }
  }

  async _listFilesInBucket(bucketId, prefix = '', options = {}) {
    await this.authorize();
    const maxFileCount = options.maxFileCount || 10000;
    const startFileName = options.startFileName || prefix;

    const response = await this._withReauthRetry('listFileNames(bucket)', async () =>
      this.b2.listFileNames({
        bucketId,
        prefix,
        startFileName,
        maxFileCount,
      })
    );

    return response.data.files;
  }

  async _getFileInfoInBucket(bucketId, remotePath) {
    await this.authorize();

    const response = await this._withReauthRetry('listFileNames(getFileInfo)', async () =>
      this.b2.listFileNames({
        bucketId,
        startFileName: remotePath,
        maxFileCount: 1,
      })
    );

    const file = response.data.files[0];
    if (!file || file.fileName !== remotePath) {
      return null;
    }
    return file;
  }

  async _uploadFileToBucket(localPath, remotePath, contentType, bucketId) {
    await this.authorize();

    const stat = fs.statSync(localPath);
    const fileSize = stat.size;
    const fileStream = fs.createReadStream(localPath);
    const uploadUrlResponse = await this._withReauthRetry('getUploadUrl', async () =>
      this.b2.getUploadUrl({ bucketId })
    );

    const uploadResponse = await this._withReauthRetry('uploadFile', async () =>
      this.b2.uploadFile({
        uploadUrl: uploadUrlResponse.data.uploadUrl,
        uploadAuthToken: uploadUrlResponse.data.authorizationToken,
        fileName: remotePath,
        data: fileStream,
        contentLength: fileSize,
        hash: 'do_not_verify',
        mime: contentType,
        axios: {
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      })
    );

    console.log(`✅ Uploaded to B2 (${bucketId}): ${remotePath}`);
    return uploadResponse.data;
  }

  async _deleteFileInBucket(bucketId, remotePath) {
    await this.authorize();

    const fileListResponse = await this._withReauthRetry('listFileNames(delete)', async () =>
      this.b2.listFileNames({
        bucketId,
        startFileName: remotePath,
        maxFileCount: 1,
      })
    );

    if (fileListResponse.data.files.length === 0) {
      return;
    }

    const file = fileListResponse.data.files[0];
    if (file.fileName !== remotePath) {
      return;
    }

    await this._withReauthRetry('deleteFileVersion', async () =>
      this.b2.deleteFileVersion({
        fileId: file.fileId,
        fileName: file.fileName,
      })
    );

    console.log(`✅ Deleted from B2 (${bucketId}): ${remotePath}`);
  }

  async _downloadStreamFromBucket(bucketName, remotePath, options = {}) {
    await this.authorize();

    const axiosConfig = {
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      responseType: 'stream',
    };

    if (options.range) {
      axiosConfig.headers = { Range: options.range };
    }

    const downloadResponse = await this._withReauthRetry('downloadFileByName(stream)', async () =>
      this.b2.downloadFileByName({
        bucketName,
        fileName: remotePath,
        responseType: 'stream',
        axios: axiosConfig,
      })
    );

    return {
      stream: downloadResponse.data,
      statusCode: downloadResponse.status || 200,
      headers: downloadResponse.headers || {},
    };
  }

  async uploadCommonAsset(localPath, remotePath, contentType = 'application/octet-stream') {
    await this.ensureCommonAssetsBucket();
    this.invalidateCommonAssetsCaches();
    if (!this.commonAssetsPublicAccess) {
      return this.uploadFile(localPath, remotePath, contentType);
    }
    return this._uploadFileToBucket(localPath, remotePath, contentType, this.commonAssetsBucketId);
  }

  async listCommonAssetFiles(prefix = '') {
    await this.ensureCommonAssetsBucket();
    if (!this.commonAssetsPublicAccess) {
      return this.listFiles(prefix);
    }
    return this._listFilesInBucket(this.commonAssetsBucketId, prefix);
  }

  async getCommonAssetFileInfo(remotePath) {
    await this.ensureCommonAssetsBucket();
    if (!this.commonAssetsPublicAccess) {
      return this.getFileInfo(remotePath);
    }
    return this._getFileInfoInBucket(this.commonAssetsBucketId, remotePath);
  }

  async deleteCommonAsset(remotePath) {
    await this.ensureCommonAssetsBucket();
    this.invalidateCommonAssetsCaches();
    if (!this.commonAssetsPublicAccess) {
      return this.deleteFile(remotePath);
    }
    return this._deleteFileInBucket(this.commonAssetsBucketId, remotePath);
  }

  async deleteCommonAssetEverywhere(remotePath) {
    await this.ensureCommonAssetsBucket();
    this.invalidateCommonAssetsCaches();
    if (this.commonAssetsBucketId) {
      await this._deleteFileInBucket(this.commonAssetsBucketId, remotePath);
    }
    if (this.bucketId && this.bucketId !== this.commonAssetsBucketId) {
      await this._deleteFileInBucket(this.bucketId, remotePath);
    }
  }

  async downloadCommonAssetStream(remotePath, options = {}) {
    await this.ensureCommonAssetsBucket();
    if (!this.commonAssetsPublicAccess) {
      return this.downloadStream(remotePath, options);
    }
    return this._downloadStreamFromBucket(this.commonAssetsBucketName, remotePath, options);
  }

  async syncLegacyCommonAssetsToPublicBucket() {
    if (this._commonAssetsMigrationDone) return;
    this._commonAssetsMigrationDone = true;

    await this.ensureCommonAssetsBucket();
    if (!this.commonAssetsPublicAccess) return;

    const prefix = 'common-assets/';
    let privateFiles = [];
    try {
      privateFiles = await this._listFilesInBucket(this.bucketId, prefix);
    } catch (err) {
      console.warn('⚠️ Could not scan private bucket for legacy common assets:', err.message);
      return;
    }

    const legacyFiles = privateFiles.filter((file) => {
      const name = file.fileName || '';
      if (!name.startsWith('common-assets/')) return false;
      const rest = name.slice('common-assets/'.length);
      const parts = rest.split('/');
      return parts.length === 2 && parts[0] && parts[1];
    });

    if (legacyFiles.length === 0) return;

    console.log(`ℹ️  Migrating ${legacyFiles.length} legacy common asset(s) to public bucket...`);
    const os = require('os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-common-assets-'));

    try {
      for (const file of legacyFiles) {
        const remotePath = file.fileName;
        const existing = await this._getFileInfoInBucket(this.commonAssetsBucketId, remotePath);
        if (existing) continue;

        const tempPath = path.join(tempDir, path.basename(remotePath));
        await this.downloadFile(remotePath, tempPath);
        await this._uploadFileToBucket(
          tempPath,
          remotePath,
          file.contentType || 'application/octet-stream',
          this.commonAssetsBucketId
        );
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      }
      console.log('✅ Legacy common assets migration complete');
    } catch (err) {
      console.warn('⚠️ Legacy common assets migration failed:', err.message);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

module.exports = new B2Service();
