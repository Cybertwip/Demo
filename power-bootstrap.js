(function() {
  'use strict';
  var base = new URL('.', document.currentScript.src);
  var cacheSettings = Module.powerWebCache || {};
  var workerURL = new URL('power-isolation-worker.js', base);
  if (cacheSettings.workerVersion) workerURL.searchParams.set('v', cacheSettings.workerVersion);
  workerURL = workerURL.href;
  var attemptKey = 'power-isolation:' + base.href;
  var retryURL = new URL(location.href);
  var retryParameter = '__power_isolation';

  // The same progress layer covers lazy downloads made by any game's file
  // reads, scene loader or explicit preparation calls. It never fetches data.
  var pending = new Map();
  var overlay = null, loadingText = null, loadingBar = null, showTimer = null;
  var loadedBytes = 0, requestedBytes = 0;
  function hideLoading() {
    clearTimeout(showTimer); showTimer = null;
    if (overlay) overlay.hidden = true;
    loadedBytes = requestedBytes = 0;
  }
  function showLoading() {
    showTimer = null;
    if (!pending.size) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'power-asset-loading';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);color:white;font:16px Arial;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;pointer-events:none';
      // Hidden must override the fixed display:flex declaration.
      overlay.style.setProperty('display', 'none');
      loadingText = document.createElement('div');
      loadingText.textContent = 'Loading assets...';
      loadingBar = document.createElement('progress');
      loadingBar.max = 1;
      loadingBar.style.cssText = 'width:280px;max-width:80vw';
      overlay.appendChild(loadingText); overlay.appendChild(loadingBar);
      document.body.appendChild(overlay);
    }
    overlay.hidden = false;
    overlay.style.display = 'flex';
    updateLoading();
  }
  function updateLoading() {
    if (!overlay) return;
    var loaded = loadedBytes;
    pending.forEach(function(item) { loaded += item.loaded; });
    loadingBar.value = requestedBytes ? Math.min(1, loaded / requestedBytes) : 0;
    loadingText.textContent = 'Loading assets... ' + Math.floor(loadingBar.value * 100) + '%';
  }
  Module.powerWebAssets = {
    persistentCache: false,
    event: function(kind, id, loaded, total) {
      if (kind === 0) {
        if (!pending.has(id)) { pending.set(id, {loaded: 0, total: total}); requestedBytes += total; }
        if (showTimer === null && (!overlay || overlay.hidden)) showTimer = setTimeout(showLoading, 150);
      } else if (kind === 1) {
        var item = pending.get(id);
        if (item) item.loaded = Math.min(item.total, loaded);
      } else {
        var finished = pending.get(id);
        if (finished) { loadedBytes += finished.total; pending.delete(id); }
      }
      if (pending.size) updateLoading();
      else { hideLoading(); if (overlay) overlay.style.display = 'none'; }
    }
  };

  function status(text, failed) {
    if (typeof Module !== 'undefined' && Module.setStatus) Module.setStatus(text);
    if (failed) {
      ['spinner', 'progress'].forEach(function(id) {
        var element = document.getElementById(id);
        if (element) element.hidden = true;
      });
      console.error('PowerGame startup: ' + text);
    }
  }
  function attempted() {
    try { return sessionStorage.getItem(attemptKey) === '1'; }
    catch (_) { return retryURL.searchParams.get(retryParameter) === '1'; }
  }
  function loadRuntime() {
    try { sessionStorage.removeItem(attemptKey); } catch (_) {}
    if (retryURL.searchParams.has(retryParameter)) {
      retryURL.searchParams.delete(retryParameter);
      history.replaceState(null, '', retryURL.href);
    }
    var runtime = document.createElement('script');
    var runtimeURL = new URL('PowerGame.js', base);
    if (cacheSettings.runtimeVersion) {
      runtimeURL.searchParams.set('v', cacheSettings.runtimeVersion);
      var previousLocateFile = Module.locateFile;
      Module.locateFile = function(path, prefix) {
        var located = previousLocateFile ? previousLocateFile(path, prefix) : (prefix || base.href) + path;
        var url = new URL(located, base);
        if (url.origin === base.origin && url.pathname.indexOf(base.pathname) === 0 &&
            /^PowerGame\.(js|wasm|data|worker\.js)$/.test(url.pathname.substring(base.pathname.length)))
          url.searchParams.set('v', cacheSettings.runtimeVersion);
        return url.href;
      };
    }
    runtime.src = runtimeURL.href;
    runtime.async = true;
    runtime.onerror = function() { status('The game runtime could not download. Reload to try again.', true); };
    document.body.appendChild(runtime);
  }
  function activated(registration) {
    return new Promise(function(resolve, reject) {
      var worker = registration.installing || registration.waiting || registration.active;
      if (!worker) { reject(new Error('No startup worker was installed.')); return; }
      function changed() {
        if (worker.state === 'activated') resolve();
        else if (worker.state === 'redundant') reject(new Error('The startup worker could not activate.'));
      }
      worker.addEventListener('statechange', changed);
      changed();
    });
  }
  function controlled() {
    return new Promise(function(resolve) {
      function changed() {
        var worker = navigator.serviceWorker.controller;
        if (worker && worker.scriptURL === workerURL) {
          navigator.serviceWorker.removeEventListener('controllerchange', changed);
          resolve();
        }
      }
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      changed();
    });
  }

  var isolated = self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
  if (!self.isSecureContext) {
    status('Open the game over HTTPS, or preview it at http://localhost:8000/ using python3 serve.py.', true);
    return;
  }
  if (!('serviceWorker' in navigator)) {
    if (isolated) { loadRuntime(); return; }
    status('The game could not start. For local preview, run python3 serve.py and open http://localhost:8000/.', true);
    return;
  }
  if (!isolated && attempted()) {
    status('The game could not start. For local preview, run python3 serve.py and open http://localhost:8000/.', true);
    return;
  }
  if (!isolated) status('Preparing game...');
  var timer;
  var timeout = new Promise(function(_, reject) {
    timer = setTimeout(function() { reject(new Error('Startup worker timed out.')); }, 12000);
  });
  var setup = navigator.serviceWorker.register(workerURL, {scope: base.href, updateViaCache: 'none'})
    .then(activated).then(controlled);
  Promise.race([setup, timeout]).then(function() {
    clearTimeout(timer);
    Module.powerWebAssets.persistentCache = true;
    if (isolated) { loadRuntime(); return; }
    try { sessionStorage.setItem(attemptKey, '1'); location.reload(); }
    catch (_) {
      retryURL.searchParams.set(retryParameter, '1');
      location.replace(retryURL.href);
    }
  }).catch(function(error) {
    clearTimeout(timer);
    console.error(error);
    if (isolated) { loadRuntime(); return; }
    status('The game could not start. For local preview, run python3 serve.py and open http://localhost:8000/.', true);
  });
})();
