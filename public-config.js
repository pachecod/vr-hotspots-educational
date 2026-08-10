/**
 * Loads public origin config (HOSTED_ORIGIN) for client URL absolutizers.
 * Safe to include on editor and admin pages.
 */
(function () {
  function apply(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    window.__PUBLIC_CONFIG__ = cfg;
    if (cfg.hostedOrigin) {
      window.__HOSTED_ORIGIN__ = String(cfg.hostedOrigin).replace(/\/$/, '');
    }
  }

  try {
    fetch('/api/public-config', { credentials: 'same-origin' })
      .then(function (res) {
        return res.json();
      })
      .then(apply)
      .catch(function () {});
  } catch (_) {}
})();
