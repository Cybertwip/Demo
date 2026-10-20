Module.powerWebCache = {"indexVersion":"0148dedfe255d0d0","runtimeVersion":"5a1f7b8931cac37c","workerVersion":"1528be862b6e5bdb"};
(Module.preRun = Module.preRun || []).push(function() {
  addRunDependency('project-index');
  fetch('web-assets.json?v=' + Module.powerWebCache.indexVersion).then(function(response) {
    if (!response.ok) throw new Error('Asset index download failed: ' + response.status);
    return response.json();
  }).then(async function(index) {
    if (index.format !== 'power.web.assets' || index.version !== 2 || index.chunkSize !== 4194304)
      throw new Error('Unsupported Web asset format.');
    index.baseURL = new URL('.', document.baseURI).href;
    FS.mkdirTree('/Content');
    index.files.forEach(function(entry, id) {
      var slash = entry.path.lastIndexOf('/');
      var directory = entry.path.substring(0, slash);
      FS.mkdirTree(directory);
      FS.createDataFile(directory, entry.path.substring(slash + 1), [], true, false);
      var node = FS.lookupPath(entry.path).node;
      node.powerWebAsset = id;
      node.usedBytes = entry.size;
      node.stream_ops = Object.assign({}, node.stream_ops, {
        read: function() { throw new FS.ErrnoError(29); }
      });
    });
    FS.writeFile('/.power-web-assets.json', JSON.stringify(index));
    await Promise.all(index.externalFiles.map(async function(entry) {
      var response = await fetch(entry.url, {cache: 'no-cache'});
      if (!response.ok) throw new Error('Online configuration download failed: ' + response.status);
      FS.writeFile(entry.path, new Uint8Array(await response.arrayBuffer()));
    }));
    removeRunDependency('project-index');
  }).catch(function(error) {
    Module.setStatus(error.message); console.error(error);
  });
});
