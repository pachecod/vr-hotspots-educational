(function () {
  if (window.__ANALYTICS_INITIALIZED__) return;

  var cfg = window.__ANALYTICS__;
  if (!cfg || !cfg.enabled || !cfg.measurementId) return;

  var id = String(cfg.measurementId).trim();
  if (!/^G-[A-Z0-9]+$/i.test(id)) return;

  window.__ANALYTICS_INITIALIZED__ = true;
  window.dataLayer = window.dataLayer || [];

  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', id, { send_page_view: true });

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(script);
})();
