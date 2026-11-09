(function (root) {
  'use strict';

  class ImageViewer {
    constructor(doc, { onClose = () => {} } = {}) {
      const { el, button } = root.ZMAPanel;
      this.doc = doc; this.scale = 1; this.mode = 'fit'; this.trigger = null; this.drag = null; this.onClose = onClose;
      this.node = el(doc, 'section', undefined, 'zma-image-viewer');
      this.node.setAttribute('role', 'dialog'); this.node.setAttribute('aria-label', '图片查看器'); this.node.setAttribute('aria-modal', 'true');
      this.node.hidden = true;
      const header = el(doc, 'header');
      header.append(el(doc, 'span', '图片查看器', 'zma-image-viewer-title'));
      const fit = button(doc, '适应窗口', () => this.fit());
      const original = button(doc, '100% 原尺寸', () => { this.mode = 'manual'; this.zoom(1); });
      const smaller = button(doc, '缩小', () => { this.mode = 'manual'; this.zoom(this.scale / 1.25); });
      const larger = button(doc, '放大', () => { this.mode = 'manual'; this.zoom(this.scale * 1.25); });
      this.label = el(doc, 'output', ''); this.closeButton = button(doc, '关闭', () => this.hide());
      header.append(fit, original, smaller, larger, this.label, this.closeButton);
      this.viewport = el(doc, 'div', undefined, 'zma-image-viewport'); this.viewport.tabIndex = 0;
      this.stage = el(doc, 'div', undefined, 'zma-image-stage'); this.image = el(doc, 'img');
      this.image.alt = '插入图片的原图'; this.image.draggable = false;
      this.stage.append(this.image); this.viewport.append(this.stage); this.node.append(header, this.viewport); doc.body.append(this.node);
      this.image.addEventListener('load', () => { if (this.mode === 'fit') this.fit(); });
      this.image.addEventListener('error', () => { this.label.textContent = '图片解码失败'; });
      this.viewport.addEventListener('wheel', event => {
        event.preventDefault(); event.stopPropagation(); this.mode = 'manual';
        this.zoom(this.scale * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
      }, { passive: false });
      this.viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); this.viewport.focus();
        this.drag = { x: event.clientX, y: event.clientY, left: this.viewport.scrollLeft, top: this.viewport.scrollTop };
        this.viewport.setPointerCapture(event.pointerId); this.viewport.classList.add('zma-image-panning');
      });
      this.viewport.addEventListener('pointermove', event => {
        if (!this.drag) return;
        this.viewport.scrollLeft = this.drag.left + this.drag.x - event.clientX;
        this.viewport.scrollTop = this.drag.top + this.drag.y - event.clientY;
      });
      const stop = () => { this.drag = null; this.viewport.classList.remove('zma-image-panning'); };
      this.viewport.addEventListener('pointerup', stop); this.viewport.addEventListener('pointercancel', stop);
      this.viewport.addEventListener('lostpointercapture', stop);
      this.keydown = event => {
        if (this.node.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.hide(); }
        else if (event.key === 'Tab') {
          const controls = [...this.node.querySelectorAll('button,[tabindex="0"]')], current = controls.indexOf(doc.activeElement);
          const next = (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
          event.preventDefault(); event.stopPropagation(); controls[next].focus();
        }
      };
      this.node.addEventListener('keydown', event => event.stopPropagation());
      doc.addEventListener('keydown', this.keydown, true);
      this.resize = () => { if (!this.node.hidden && this.mode === 'fit') this.fit(); };
      doc.defaultView.addEventListener('resize', this.resize);
    }

    show(src, trigger) {
      this.trigger = trigger || this.doc.activeElement; this.node.hidden = false; this.mode = 'fit';
      this.image.src = src;
      if (this.image.complete && this.image.naturalWidth) this.fit();
      this.closeButton.focus();
    }

    fit() {
      if (!this.image.naturalWidth || this.node.hidden) return;
      this.mode = 'fit';
      this.zoom(Math.min(1, (this.viewport.clientWidth - 24) / this.image.naturalWidth, (this.viewport.clientHeight - 24) / this.image.naturalHeight));
      this.viewport.scrollLeft = 0; this.viewport.scrollTop = 0;
    }

    zoom(value, x, y) {
      if (!this.image.naturalWidth) return;
      const area = this.viewport.getBoundingClientRect(), before = this.image.getBoundingClientRect();
      x ??= area.left + area.width / 2; y ??= area.top + area.height / 2;
      const imageX = (x - before.left) / this.scale, imageY = (y - before.top) / this.scale;
      this.scale = Math.max(0.001, Math.min(16, value));
      this.image.style.width = this.image.naturalWidth * this.scale + 'px';
      this.image.style.height = this.image.naturalHeight * this.scale + 'px';
      const after = this.image.getBoundingClientRect();
      this.viewport.scrollLeft += after.left + imageX * this.scale - x;
      this.viewport.scrollTop += after.top + imageY * this.scale - y;
      this.label.textContent = Math.round(this.scale * 100) + '%';
    }

    hide() {
      if (this.node.hidden) return;
      this.node.hidden = true; this.drag = null;
      if (this.trigger?.isConnected) this.trigger.focus();
      this.onClose();
    }

    destroy() {
      this.hide(); this.doc.removeEventListener('keydown', this.keydown, true);
      this.doc.defaultView.removeEventListener('resize', this.resize); this.image.removeAttribute('src'); this.node.remove();
    }
  }

  root.ZMAImageViewer = { ImageViewer };
  if (typeof module !== 'undefined') module.exports = root.ZMAImageViewer;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
