(function (root) {
  'use strict';
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  function filesFrom(data) {
    const files = Array.from(data?.files || []);
    if (files.length) return files;
    return Array.from(data?.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
  }

  function install(host, session, runtime, insert) {
    if (runtime.imageInput) return runtime.imageInput;
    const card = runtime.card, doc = card.ownerDocument;
    const status = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
    status.className = 'zma-image-status'; status.setAttribute('role', 'status');
    card.querySelector('footer')?.append(status);
    let queue = Promise.resolve();
    const readonly = () => runtime.annotation.readOnly || host.isReadOnly(session.reader);
    const report = text => {
      if (!card.isConnected) return;
      status.textContent = text;
      session.invalidateRuntimeHeight(runtime); session.relayoutRuntime(runtime);
    };
    const consume = event => { event.preventDefault(); event.stopPropagation(); };
    const enqueue = inputs => {
      if (!inputs.length) return queue;
      if (readonly()) { report('此批注为只读，无法插入图片'); return queue; }
      queue = queue.then(async () => {
        report('正在插入图片…');
        const result = await insert(inputs);
        const saved = result.inserted ? '已插入 ' + result.inserted + ' 张图片。' : '';
        report(saved + result.errors.join('。'));
      }).catch(error => report(error.message));
      return queue;
    };
    card.addEventListener('paste', event => {
      try {
        let inputs = filesFrom(event.clipboardData);
        if (!inputs.length && !readonly()) inputs = Array.from(host.readAttachmentClipboard({ maxBytes: MAX_IMAGE_BYTES }));
        if (!inputs.length) return;
        consume(event); void enqueue(inputs);
      } catch (error) { consume(event); report(error.message); }
    }, true);
    card.addEventListener('dragover', event => {
      const data = event.dataTransfer;
      if (!Array.from(data?.types || []).includes('Files') && !filesFrom(data).length) return;
      consume(event);
      if (data) data.dropEffect = readonly() ? 'none' : 'copy';
      card.classList.toggle('zma-image-drop-target', !readonly());
    }, true);
    card.addEventListener('dragleave', event => {
      if (!event.relatedTarget || !card.contains(event.relatedTarget)) card.classList.remove('zma-image-drop-target');
    }, true);
    card.addEventListener('drop', event => {
      card.classList.remove('zma-image-drop-target');
      const inputs = filesFrom(event.dataTransfer);
      if (!inputs.length) return;
      consume(event); void enqueue(inputs);
    }, true);
    runtime.imageInput = { insert: enqueue };
    return runtime.imageInput;
  }

  root.ZMAMarginImages = { install, filesFrom };
  if (typeof module !== 'undefined') module.exports = root.ZMAMarginImages;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
