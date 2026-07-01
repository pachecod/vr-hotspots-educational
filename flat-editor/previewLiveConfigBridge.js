/** Inline script injected into preview iframes — receives live config patches from the editor. */
export const PREVIEW_LIVE_CONFIG_BRIDGE = `<script>
(function () {
  function parsePath(path) {
    return String(path || '')
      .replace(/\\[(\\d+)\\]/g, '.$1')
      .split('.')
      .filter(Boolean);
  }
  function setPath(obj, path, value) {
    var parts = parsePath(path);
    if (!parts.length || !obj || typeof obj !== 'object') return;
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      var next = parts[i + 1];
      if (cur[p] == null || typeof cur[p] !== 'object') {
        cur[p] = /^\\d+$/.test(next) ? [] : {};
      }
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'flat-config-live') return;
    if (e.source !== window.parent) return;
    var cfg = window.__FLAT_PAGE_CONFIG__;
    if (!cfg || typeof cfg !== 'object') return;
    setPath(cfg, e.data.path, e.data.value);
    window.dispatchEvent(
      new CustomEvent('flat-page-config-live', {
        detail: { path: e.data.path, value: e.data.value },
      })
    );
  });
})();
</script>`;
