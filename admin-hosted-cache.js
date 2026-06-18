(function (global) {
  const DB_NAME = 'vr-hotspots-admin-cache';
  const STORE_NAME = 'hostedProjects';
  const VERSION = 1;

  function openDB() {
    if (!('indexedDB' in global)) return Promise.resolve(null);
    if (global.__VR_HOSTED_DB_PROMISE__) return global.__VR_HOSTED_DB_PROMISE__;
    global.__VR_HOSTED_DB_PROMISE__ = new Promise((resolve) => {
      const req = global.indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'path' });
        }
      };
      req.onerror = () => resolve(null);
      req.onsuccess = () => resolve(req.result);
    });
    return global.__VR_HOSTED_DB_PROMISE__;
  }

  function withStore(mode, fn) {
    return openDB().then((db) => {
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        fn(store, resolve);
        tx.onerror = () => resolve(null);
      });
    });
  }

  function saveHostedProject(path, projectName, config) {
    if (!path || !config) return Promise.resolve(null);
    const record = {
      path,
      projectName: projectName || path,
      updatedAt: Date.now(),
      config: JSON.parse(JSON.stringify(config)),
    };
    return withStore('readwrite', (store, resolve) => {
      store.put(record);
      resolve(record);
    });
  }

  function getHostedProject(path) {
    if (!path) return Promise.resolve(null);
    return withStore('readonly', (store, resolve) => {
      const req = store.get(path);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  function deleteHostedProject(path) {
    if (!path) return Promise.resolve(null);
    return withStore('readwrite', (store, resolve) => {
      store.delete(path);
      resolve(true);
    });
  }

  global.AdminHostedCache = {
    openDB,
    saveHostedProject,
    getHostedProject,
    deleteHostedProject,
  };
})(window);
