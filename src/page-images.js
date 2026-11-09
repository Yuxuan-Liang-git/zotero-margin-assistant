(function (root) {
  'use strict';
  const P = root.ZMAPageImageCore || (typeof require !== 'undefined' ? require('./page-image-core.js') : null);
  const imageFile = file => /^image\//i.test(file?.type || '') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file?.name || '');

  class PageImages {
    constructor(host, reader, session) {
      this.host = host; this.reader = reader; this.session = session; this.adapter = session.adapter;
      this.doc = this.adapter.document(); this.entries = new Map(); this.layers = new Map(); this.assets = new Map();
      this.listeners = []; this.selected = null; this.drag = null; this.context = null; this.ready = false; this.destroyed = false; this.frame = null; this.revision = 0;
      const { el } = root.ZMAPanel;
      this.status = el(this.doc, 'section', undefined, 'zma-page-image-status'); this.status.setAttribute('role', 'status'); this.status.hidden = true; this.doc.body.append(this.status);
      this.listen(this.doc, 'pointerdown', event => this.pointerDown(event), true);
      this.listen(this.doc, 'contextmenu', event => { const point = this.point(event); if (point) this.context = point; }, true);
      this.listen(this.doc, 'pointermove', event => { if (this.drag) { this.drag.last = event; this.schedule(); } }, true);
      this.listen(this.doc, 'pointerup', event => this.pointerUp(event), true);
      this.listen(this.doc, 'pointercancel', () => this.cancelDrag(), true);
      this.listen(this.doc, 'keydown', event => this.keydown(event), true);
      this.listen(this.doc, 'paste', event => this.paste(event), true);
      this.listen(this.doc, 'drop', event => this.drop(event), true);
      this.listen(this.doc, 'dragover', event => {
        const point = this.point(event); if (!point || !Array.from(event.dataTransfer?.types || []).includes('Files')) return;
        const files = root.ZMAMarginImages.filesFrom(event.dataTransfer);
        if (files.length && !files.some(imageFile)) return;
        event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = host.isReadOnly(reader) ? 'none' : 'copy';
      }, true);
      this.listen(this.doc, 'scroll', () => this.schedule(), true);
      this.listen(this.doc.defaultView, 'resize', () => this.schedule());
      this.layout = () => { if (this.drag) this.cancelDrag(); this.schedule(); };
      this.bus = host.unwrap(this.adapter.pdfWindow?.PDFViewerApplication?.eventBus);
      for (const name of ['pagerendered', 'scalechanging', 'rotationchanging', 'updateviewarea']) this.bus?.on(name, this.layout);
      const Observer = this.doc.defaultView.MutationObserver;
      this.observer = new Observer(records => {
        if (records.some(record => record.target?.matches?.('.page') && record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.('.page') || node.querySelector?.('.page')))) this.schedule();
      });
      this.observer.observe(this.doc.body, host.cloneInto({ childList: true, subtree: true, attributes: true, attributeFilter: ['style'] }, this.doc.defaultView));
      this.handle(() => this.refresh());
    }

    listen(target, type, callback, capture = false) { target.addEventListener(type, callback, capture); this.listeners.push(() => target.removeEventListener(type, callback, capture)); }
    handle(action) { void Promise.resolve().then(action).catch(error => this.report(error.message)); }
    report(message) { if (this.destroyed) return; this.status.replaceChildren(); this.status.textContent = message; this.status.hidden = !message; }

    async refresh() {
      const revision = ++this.revision, state = await this.host.load(this.reader), info = await this.host.pageImageInfo(this.reader);
      if (this.destroyed || revision !== this.revision) return;
      this.state = state; this.info = info; this.ready = true; this.paint();
    }

    schedule() {
      if (this.destroyed || this.frame !== null) return;
      this.frame = this.doc.defaultView.requestAnimationFrame(() => { this.frame = null; this.updateDrag(); this.paint(); });
    }

    point(event) {
      const element = event.target?.closest?.('.page[data-page-number]'); if (!element) return null;
      const pageIndex = Number(element.dataset.pageNumber) - 1, page = this.adapter.page(pageIndex);
      if (!page || this.host.unwrap(page.element) !== this.host.unwrap(element)) return null;
      const box = element.getBoundingClientRect();
      const sx = box.width / element.offsetWidth || 1, sy = box.height / element.offsetHeight || 1;
      return { pageIndex, x: (event.clientX - box.left - element.clientLeft * sx) * page.viewport.width / (element.clientWidth * sx), y: (event.clientY - box.top - element.clientTop * sy) * page.viewport.height / (element.clientHeight * sy) };
    }

    center() {
      const pageIndex = this.adapter.currentPageIndex(), page = this.adapter.page(pageIndex);
      if (!page) throw new Error('当前 PDF 页面尚未就绪');
      return { pageIndex, x: page.viewport.width / 2, y: page.viewport.height / 2 };
    }

    menu(append) {
      const point = this.context || this.center(), disabled = !this.ready || this.host.isReadOnly(this.reader);
      append({ label: '在此插入图片', disabled, onCommand: () => this.handle(async () => { const file = await this.host.chooseImage?.(this.host.runtimeWindow()); if (file) await this.insert([file], point); }) });
      append({ label: '在此粘贴图片', disabled, onCommand: () => this.handle(() => this.insert(this.host.readAttachmentClipboard({ maxBytes: 10 * 1024 * 1024 }), point)) });
      append({ label: '导出带图片的 PDF', disabled: !this.ready || !this.state.pageImages?.length, onCommand: () => this.handle(() => this.host.exportPageImages(this.reader)) });
    }

    paste(event) {
      if (!this.ready || event.target?.closest?.('input,textarea,[contenteditable],.zmc-card,.zma-panel,.zma-notion-dock,.zma-image-viewer')) return;
      if (!event.target?.closest?.('.page,#viewer,.pdf-container') && !this.doc.activeElement?.closest?.('.page,#viewer,.pdf-container')) return;
      try {
        let files = root.ZMAMarginImages.filesFrom(event.clipboardData).filter(imageFile);
        if (!files.length) files = this.host.readAttachmentClipboard({ maxBytes: 10 * 1024 * 1024 });
        if (!files.length) return;
        event.preventDefault(); event.stopPropagation(); this.handle(() => this.insert(files, this.context || this.center()));
      } catch (error) { event.preventDefault(); event.stopPropagation(); this.report(error.message); }
    }

    drop(event) {
      const point = this.point(event); if (!point || event.target?.closest?.('.zmc-card,.zma-panel,input,textarea,[contenteditable]')) return;
      const files = root.ZMAMarginImages.filesFrom(event.dataTransfer).filter(imageFile); if (!files.length) return;
      event.preventDefault(); event.stopPropagation(); this.handle(() => this.insert(files, point));
    }

    async assertWritable(fingerprint) {
      if (this.destroyed || !this.host.running || this.host.closedReaders.has(this.reader)) throw new Error('页面图片操作已停止');
      if (this.host.isReadOnly(this.reader)) throw new Error('此文献库为只读，无法修改页面图片');
      const info = await this.host.pageImageInfo(this.reader);
      if (fingerprint && info.fingerprint !== fingerprint) throw new Error('PDF 文件已经改变，请重新放置图片');
      if (this.destroyed || !this.host.running || this.host.closedReaders.has(this.reader)) throw new Error('页面图片操作已停止');
      if (this.host.isReadOnly(this.reader)) throw new Error('此文献库为只读，无法修改页面图片');
      return info;
    }

    async dimensions(src) {
      const image = new this.doc.defaultView.Image();
      return new Promise((resolve, reject) => {
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('图片无法解码')); image.src = src;
      });
    }

    placement(asset, dimensions, point, info, id) {
      const page = this.adapter.page(point.pageIndex); if (!page || point.pageIndex >= info.pageCount) throw new Error('目标 PDF 页面尚未就绪');
      const width = Math.min(dimensions.width, 360, page.viewport.width * 0.6), height = width * dimensions.height / dimensions.width;
      const factor = Math.min(1, page.viewport.height * 0.6 / height), w = width * factor, h = height * factor;
      const x = Math.max(0, Math.min(point.x - w / 2, page.viewport.width - w)), y = Math.max(0, Math.min(point.y - h / 2, page.viewport.height - h));
      return P.fromViewport({ id: id || this.host.runtimeWindow().crypto.randomUUID().replace(/-/g, ''), imageID: asset.id, pageIndex: point.pageIndex, fingerprint: info.fingerprint }, { x, y, width: w, height: h }, page.viewport);
    }

    async insert(inputs, point = this.center()) {
      let inserted = 0; const errors = [];
      for (const input of inputs) {
        try {
          const info = await this.assertWritable(), prepared = await this.host.imageManager.readImageInput(input);
          const src = this.host.imageManager.dataURL(prepared.bytes, prepared.mime), dimensions = await this.dimensions(src);
          await this.host.imageManager.importImage(this.reader, { pageIndex: point.pageIndex, fingerprint: info.fingerprint }, { bytes: prepared.bytes }, this.state, async asset => {
            let record = this.placement(asset, dimensions, point, info);
            const viewport = this.adapter.page(point.pageIndex).viewport, box = P.toViewport(record, viewport), offset = inserted * 20;
            record = P.move(record, box.x + box.width + offset <= viewport.width ? offset : -offset, box.y + box.height + offset <= viewport.height ? offset : -offset, viewport);
            const previous = this.state.pageImages;
            this.state.pageImages = [...(previous || []), record];
            try { await this.host.save(this.reader, this.state, { imageCommit: true }); }
            catch (error) { if (previous) this.state.pageImages = previous; else delete this.state.pageImages; throw error; }
            this.selected = record.id;
          });
          inserted++;
        } catch (error) { errors.push(error.message); }
      }
      this.report(errors.join('。')); await this.refresh(); this.host.refreshPageImages(this.reader, this); return { inserted, errors };
    }

    async place(asset, point = this.center(), replaceID = null) {
      return this.host.imageManager.transaction(this.reader, async () => {
        const info = await this.assertWritable();
        if (!this.state.images.some(image => image.id === asset.id)) throw new Error('图片不属于当前 PDF');
        const dimensions = await this.dimensions(await this.asset(asset)), record = this.placement(asset, dimensions, point, info, replaceID);
        await this.assertWritable(info.fingerprint);
        const previous = this.state.pageImages, version = this.state.version;
        this.state.pageImages = [...(previous || []).filter(image => image.id !== replaceID), record]; this.state.version = 3;
        try { await this.host.save(this.reader, this.state, { imageCommit: true }); }
        catch (error) { if (previous) this.state.pageImages = previous; else delete this.state.pageImages; this.state.version = version; throw error; }
        this.selected = record.id; this.report(''); this.paint(); this.host.refreshPageImages(this.reader, this); return record;
      });
    }

    async change(expected, next) {
      return this.host.imageManager.transaction(this.reader, async () => {
        const info = await this.assertWritable(expected.fingerprint), index = this.state.pageImages.findIndex(image => image.id === expected.id);
        if (index < 0 || JSON.stringify(this.state.pageImages[index]) !== JSON.stringify(expected)) throw new Error('图片已在其他位置修改，请重试');
        if (expected.locked && (!next || JSON.stringify({ ...next, locked: true }) !== JSON.stringify(expected))) throw new Error('请先解锁图片');
        if (next) {
          next = P.cleanPlacement(next);
          const page = this.adapter.page(next.pageIndex);
          if (next.id !== expected.id || next.imageID !== expected.imageID || next.fingerprint !== info.fingerprint || !page || !P.within(next, page.viewport.viewBox)) throw new Error('页面图片位置无效');
        }
        const previous = this.state.pageImages;
        this.state.pageImages = next ? previous.map(image => image.id === next.id ? next : image) : previous.filter(image => image.id !== expected.id);
        try { await this.host.save(this.reader, this.state, { imageCommit: true }); }
        catch (error) { this.state.pageImages = previous; this.paint(); throw error; }
        this.report(''); this.paint(); this.host.refreshPageImages(this.reader, this);
      });
    }

    asset(record) {
      if (!this.assets.has(record.id)) {
        while (this.assets.size >= 4) this.assets.delete(this.assets.keys().next().value);
        const pending = this.host.imageManager.readImage(this.reader, record); this.assets.set(record.id, pending);
        pending.catch(() => { if (this.assets.get(record.id) === pending) this.assets.delete(record.id); });
      }
      return this.assets.get(record.id);
    }

    entry(record, page) {
      const { el, button } = root.ZMAPanel;
      let layer = this.layers.get(page.element);
      if (!layer) { layer = el(this.doc, 'div', undefined, 'zma-page-image-layer'); page.element.append(layer); this.layers.set(page.element, layer); }
      // PDF.js can retain the page element while clearing its rendered children.
      if (layer.parentElement !== page.element) page.element.append(layer);
      const node = el(this.doc, 'div', undefined, 'zma-page-image'); node.dataset.placementID = record.id; node.tabIndex = 0;
      const image = el(this.doc, 'img'); image.alt = 'PDF 页面插入的图片'; image.draggable = false;
      const actions = el(this.doc, 'div', undefined, 'zma-page-image-actions');
      const current = () => this.state.pageImages.find(item => item.id === record.id);
      const lock = button(this.doc, '锁定', () => this.handle(() => { const item = current(); return this.change(item, { ...item, locked: !item.locked }); }));
      const remove = button(this.doc, '移除页面图片', () => this.handle(() => this.change(current(), null)));
      const view = button(this.doc, '查看原图', () => this.handle(() => this.host.viewImage(this.reader, this.state.images.find(item => item.id === record.imageID), view)));
      actions.append(lock, remove, view);
      const handle = button(this.doc, '调整图片大小', () => {}); handle.className = 'zma-page-image-handle'; handle.setAttribute('aria-label', '调整图片大小');
      node.append(image, actions, handle); layer.append(node);
      const entry = { node, image, actions, lock, remove, handle, record, preview: null };
      image.addEventListener('load', () => { if (!this.destroyed && this.entries.get(record.id) === entry) this.schedule(); });
      node.addEventListener('dblclick', event => { if (!event.target.closest('button')) { event.stopPropagation(); this.handle(() => this.host.viewImage(this.reader, this.state.images.find(item => item.id === record.imageID), node)); } });
      const asset = this.state.images.find(item => item.id === record.imageID);
      this.asset(asset).then(src => { if (!this.destroyed && this.entries.get(record.id) === entry) image.src = src; }).catch(error => this.report(error.message));
      return entry;
    }

    draw(entry, record, page) {
      const display = P.toViewport(record, page.viewport), sx = page.element.clientWidth / page.viewport.width, sy = page.element.clientHeight / page.viewport.height;
      Object.assign(entry.node.style, { left: display.x * sx + 'px', top: display.y * sy + 'px', width: display.width * sx + 'px', height: display.height * sy + 'px' });
      const width = entry.image.naturalWidth || 1, height = entry.image.naturalHeight || 1, m = display.matrix;
      entry.image.style.width = width + 'px'; entry.image.style.height = height + 'px';
      entry.image.style.transform = 'matrix(' + [m[0] * sx / width, m[1] * sy / width, m[2] * sx / height, m[3] * sy / height, (m[4] - display.x) * sx, (m[5] - display.y) * sy].join(',') + ')';
      const selected = this.selected === record.id, readonly = this.host.isReadOnly(this.reader);
      entry.node.classList.toggle('zma-page-image-selected', selected); entry.actions.hidden = !selected; entry.handle.hidden = !selected || record.locked || readonly;
      entry.lock.textContent = record.locked ? '解锁' : '锁定'; entry.lock.disabled = readonly; entry.remove.disabled = readonly || record.locked; entry.record = record;
    }

    paint() {
      if (!this.ready || this.destroyed) return;
      const active = new Set(), invalid = [];
      for (const record of this.state.pageImages || []) {
        const page = this.adapter.page(record.pageIndex);
        if (record.fingerprint !== this.info.fingerprint || record.pageIndex >= this.info.pageCount || page && !P.within(record, page.viewport.viewBox)) { invalid.push(record); continue; }
        if (!page?.element.isConnected) continue;
        const rect = page.element.getBoundingClientRect(); if (rect.bottom < -150 || rect.top > this.doc.defaultView.innerHeight + 150) continue;
        let entry = this.entries.get(record.id);
        if (!entry || entry.node.parentElement?.parentElement !== page.element) { entry?.node.remove(); entry = this.entry(record, page); this.entries.set(record.id, entry); }
        active.add(record.id); this.draw(entry, entry.preview || record, page);
      }
      for (const [id, entry] of this.entries) if (!active.has(id)) { entry.node.remove(); this.entries.delete(id); }
      for (const [element, layer] of this.layers) if (!element.isConnected || !layer.children.length) { layer.remove(); this.layers.delete(element); }
      if (invalid.length) {
        this.report(invalid.length + ' 张图片需要重新放置');
        const item = invalid[0], asset = this.state.images.find(image => image.id === item.imageID);
        if (asset) this.status.append(root.ZMAPanel.button(this.doc, '重新放置', () => this.handle(() => this.place(asset, this.center(), item.id))));
      }
    }

    pointerDown(event) {
      const node = event.target?.closest?.('.zma-page-image');
      if (!node) { if (this.point(event)) this.context = this.point(event); if (this.selected) { this.selected = null; this.schedule(); } return; }
      const entry = this.entries.get(node.dataset.placementID); if (!entry || event.button !== 0) return;
      this.selected = entry.record.id; this.schedule();
      if (event.target.closest('button') && !event.target.closest('.zma-page-image-handle')) return;
      event.preventDefault(); event.stopPropagation(); node.focus();
      if (entry.record.locked || this.host.isReadOnly(this.reader)) return;
      const point = this.point(event), page = this.adapter.page(entry.record.pageIndex);
      this.drag = { entry, original: P.cleanPlacement(entry.record), point, viewport: page.viewport, resize: !!event.target.closest('.zma-page-image-handle'), last: event };
      node.setPointerCapture(event.pointerId);
    }

    updateDrag() {
      if (!this.drag) return;
      const drag = this.drag, page = this.adapter.page(drag.original.pageIndex);
      if (!page || page.viewport !== drag.viewport) { this.cancelDrag(); return; }
      const event = drag.last, box = page.element.getBoundingClientRect();
      const dx = (event.clientX - box.left - page.element.clientLeft) * page.viewport.width / page.element.clientWidth - drag.point.x;
      const dy = (event.clientY - box.top - page.element.clientTop) * page.viewport.height / page.element.clientHeight - drag.point.y;
      if (drag.resize) {
        const size = P.toViewport(drag.original, drag.viewport), factor = 1 + (dx * size.width + dy * size.height) / (size.width ** 2 + size.height ** 2);
        drag.entry.preview = P.resize(drag.original, Math.max(0.001, factor), drag.viewport);
      } else drag.entry.preview = P.move(drag.original, dx, dy, drag.viewport);
    }

    pointerUp(event) {
      if (!this.drag) return;
      this.drag.last = event; this.updateDrag(); const drag = this.drag; if (!drag) return;
      this.drag = null; const next = drag.entry.preview;
      if (!next || JSON.stringify(next) === JSON.stringify(drag.original)) { drag.entry.preview = null; return; }
      this.handle(async () => { try { await this.change(drag.original, next); } finally { drag.entry.preview = null; this.schedule(); } });
    }

    cancelDrag() { if (this.drag) this.drag.entry.preview = null; this.drag = null; this.schedule(); }
    keydown(event) {
      if (event.key === 'Escape' && this.drag) { event.preventDefault(); event.stopPropagation(); this.cancelDrag(); return; }
      const node = event.target?.closest?.('.zma-page-image'); if (!node) return;
      const entry = this.entries.get(node.dataset.placementID); if (!entry) return;
      if (event.key === 'Delete' && !entry.record.locked) { event.preventDefault(); event.stopPropagation(); this.handle(() => this.change(entry.record, null)); }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && !entry.record.locked) {
        event.preventDefault(); event.stopPropagation(); const page = this.adapter.page(entry.record.pageIndex), amount = event.shiftKey ? 10 : 1;
        const next = event.target.closest('.zma-page-image-handle') ? P.resize(entry.record, 1 + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -0.02 : 0.02), page.viewport) : P.move(entry.record, event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0, event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0, page.viewport);
        this.handle(() => this.change(entry.record, next));
      }
    }

    destroy() {
      this.destroyed = true; this.revision++; if (this.frame !== null) this.doc.defaultView.cancelAnimationFrame(this.frame);
      this.observer.disconnect(); for (const remove of this.listeners) remove();
      for (const name of ['pagerendered', 'scalechanging', 'rotationchanging', 'updateviewarea']) this.bus?.off(name, this.layout);
      for (const layer of this.layers.values()) layer.remove(); this.layers.clear(); this.entries.clear(); this.assets.clear(); this.status.remove(); this.drag = null;
    }
  }

  root.ZMAPageImages = { PageImages }; if (typeof module !== 'undefined') module.exports = root.ZMAPageImages;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
