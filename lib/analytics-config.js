const { getSetting, setSetting } = require('./app-settings');

const MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/i;

function isValidMeasurementId(value) {
  const id = String(value || '').trim();
  return MEASUREMENT_ID_RE.test(id);
}

function getEnvMeasurementId() {
  const id = String(process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID || '').trim();
  return isValidMeasurementId(id) ? id : null;
}

function isLocalhostRequest(req) {
  const host = String(req?.headers?.host || '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function allowLocalhostAnalytics() {
  return process.env.GOOGLE_ANALYTICS_ALLOW_LOCALHOST === 'true';
}

async function getAnalyticsEnabledFlag() {
  const measurementId = getEnvMeasurementId();
  const envDefault = !!measurementId;
  const stored = await getSetting('analytics_enabled', null);
  if (stored === null) return envDefault;
  return stored === true || stored === 'true';
}

async function setAnalyticsEnabled(enabled) {
  await setSetting('analytics_enabled', !!enabled);
}

/**
 * Resolve analytics config for server-side injection and public API.
 * @param {import('express').Request} [req] - When provided, localhost guard applies.
 */
async function getAnalyticsConfig(req) {
  const measurementId = getEnvMeasurementId();
  const configured = !!measurementId;
  let enabled = await getAnalyticsEnabledFlag();

  if (enabled && req && isLocalhostRequest(req) && !allowLocalhostAnalytics()) {
    enabled = false;
  }

  return {
    enabled: enabled && configured,
    configured,
    measurementId: enabled && configured ? measurementId : null,
  };
}

module.exports = {
  isValidMeasurementId,
  getEnvMeasurementId,
  getAnalyticsEnabledFlag,
  setAnalyticsEnabled,
  getAnalyticsConfig,
  isLocalhostRequest,
  allowLocalhostAnalytics,
};
