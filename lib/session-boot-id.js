const crypto = require('crypto');

/** New value on every server process start — invalidates session cookies after deploy/restart. */
const SESSION_BOOT_ID = crypto.randomBytes(16).toString('hex');

module.exports = { SESSION_BOOT_ID };
