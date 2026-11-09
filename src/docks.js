(function (root) {
  'use strict';

  const defaults = { assistantSide: 'right', assistantWidth: 420, notionWidth: 380 };

  function normalize(value) {
    let stored = value;
    if (typeof stored === 'string') {
      try { stored = JSON.parse(stored); } catch { stored = {}; }
    }
    const layout = { ...defaults };
    if (stored?.assistantSide === 'left') layout.assistantSide = 'left';
    for (const key of ['assistantWidth', 'notionWidth']) {
      if (Number.isFinite(stored?.[key]) && stored[key] >= 200 && stored[key] <= 1200) {
        layout[key] = Math.round(stored[key]);
      }
    }
    return layout;
  }

  class DockController {
    constructor(panel, header) {
      this.panel = panel;
      this.doc = panel.doc;
      this.win = this.doc.defaultView;
      this.api = panel.host.dockLayoutAPI?.();
      this.state = normalize(this.api?.state());
      this.entries = new Map();
      this.cleanups = [];
      this.add('assistant', panel.node, header, '文档助手');
      if (panel.notion) this.add('notion', panel.notion.node, panel.notion.header, 'Notion');
      this.onResize = () => this.update();
      this.win.addEventListener('resize', this.onResize);
      this.legacyWidth = '';
      this.legacyBaseWidth = this.state.assistantWidth;
      this.styleObserver = new this.win.MutationObserver(() => {
        const current = this.doc.documentElement.style.getPropertyValue('--zma-assistant-user-width');
        if (current === this.legacyWidth) return;
        if (!this.legacyWidth) this.legacyBaseWidth = this.state.assistantWidth;
        this.legacyWidth = current;
        this.state.assistantWidth = current ? parseFloat(current) || this.legacyBaseWidth : this.legacyBaseWidth;
        this.update();
      });
      this.styleObserver.observe(this.doc.documentElement, { attributes: true, attributeFilter: ['style'] });
      this.update();
    }

    side(name) {
      if (name === 'assistant') return this.state.assistantSide;
      return this.state.assistantSide === 'left' ? 'right' : 'left';
    }

    add(name, node, header, label) {
      node.classList.add('zma-dock-panel');
      node.dataset.dock = name;
      header.classList.add('zma-dock-header');
      header.tabIndex = 0;
      header.setAttribute('contenteditable', 'false');
      header.setAttribute('aria-label', '拖动' + label + '栏');
      header.title = '拖动标题栏到窗口左半边或右半边。Alt + 左右方向键也可切换。';
      const handle = root.ZMAPanel.el(this.doc, 'div', undefined, 'zma-resizer');
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-label', name === 'assistant' ? '调整文档助手宽度' : '调整 Notion 栏宽度');
      handle.setAttribute('aria-orientation', 'vertical');
      node.prepend(handle);
      this.entries.set(name, { node, header, handle });
      this.bindGesture(header, name, 'move');
      this.bindGesture(handle, name, 'resize');
      const keydown = event => {
        if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        this.move(name, event.key === 'ArrowLeft' ? 'left' : 'right');
      };
      header.addEventListener('keydown', keydown);
      this.cleanups.push(() => header.removeEventListener('keydown', keydown));
    }

    bindGesture(target, name, kind) {
      const start = event => {
        if (event.button !== 0 || this.gesture || event.target.closest?.('button,input,select,textarea,a')) return;
        event.preventDefault();
        const state = { ...this.state };
        if (kind === 'resize') {
          for (const [entryName, entry] of this.entries) {
            if (!entry.node.hidden) this.state[entryName + 'Width'] = entry.node.getBoundingClientRect().width;
          }
        }
        this.gesture = { name, kind, target, id: event.pointerId, x: event.clientX, width: this.entries.get(name).node.getBoundingClientRect().width, state, moved: false };
        try { target.setPointerCapture(event.pointerId); } catch { /* Synthetic native checks have no active pointer. */ }
      };
      const move = event => {
        const gesture = this.gesture;
        if (!gesture || gesture.target !== target || gesture.id !== event.pointerId) return;
        if (kind === 'resize') {
          const other = this.entries.get(name === 'assistant' ? 'notion' : 'assistant');
          const otherWidth = other && !other.node.hidden ? other.node.getBoundingClientRect().width : 0;
          const budget = this.win.innerWidth - Math.min(360, this.win.innerWidth * .4);
          const maximum = Math.min(1200, otherWidth ? budget - otherWidth : this.win.innerWidth * .55);
          const direction = this.side(name) === 'left' ? 1 : -1;
          const requested = gesture.width + (event.clientX - gesture.x) * direction;
          this.state[name + 'Width'] = Math.max(Math.min(name === 'assistant' ? 280 : 240, maximum), Math.min(maximum, requested));
          this.update();
        } else if (Math.abs(event.clientX - gesture.x) > 8 || gesture.moved) {
          gesture.moved = true;
          if (!this.hint) {
            this.hint = root.ZMAPanel.el(this.doc, 'div', undefined, 'zma-dock-drop-hint');
            this.doc.body.append(this.hint);
          }
          const side = event.clientX < this.win.innerWidth / 2 ? 'left' : 'right';
          this.hint.textContent = side === 'left' ? '放到左侧' : '放到右侧';
          this.hint.dataset.side = side;
        }
      };
      const finish = event => {
        const gesture = this.gesture;
        if (!gesture || gesture.target !== target || gesture.id !== event.pointerId) return;
        if (event.type === 'pointerup') move(event);
        this.gesture = null;
        this.hint?.remove();
        this.hint = null;
        if (event.type !== 'pointerup') {
          this.state = gesture.state;
          this.update();
        } else if (kind === 'move' && gesture.moved) {
          this.move(name, event.clientX < this.win.innerWidth / 2 ? 'left' : 'right');
        } else if (kind === 'resize') this.persist();
        try { if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); } catch {}
      };
      target.addEventListener('pointerdown', start);
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', finish);
      target.addEventListener('pointercancel', finish);
      target.addEventListener('lostpointercapture', finish);
      this.cleanups.push(() => {
        target.removeEventListener('pointerdown', start);
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', finish);
        target.removeEventListener('pointercancel', finish);
        target.removeEventListener('lostpointercapture', finish);
      });
    }

    move(name, side) {
      this.state.assistantSide = name === 'assistant' ? side : side === 'left' ? 'right' : 'left';
      this.update();
      this.persist();
    }

    setState(value) {
      this.state = normalize(value);
      this.update();
    }

    persist() {
      this.state = normalize(this.state);
      try { this.api?.save({ ...this.state }); } catch (error) { this.panel.error(error); }
    }

    update() {
      const viewport = this.win.innerWidth;
      const widths = {};
      let total = 0;
      for (const [name, entry] of this.entries) {
        widths[name] = entry.node.hidden ? 0 : Math.min(this.state[name + 'Width'], viewport * .55);
        total += widths[name];
      }
      const budget = viewport - Math.min(360, viewport * .4);
      const ratio = total > budget ? budget / total : 1;
      let left = 0;
      let right = 0;
      for (const [name, entry] of this.entries) {
        const side = this.side(name);
        const width = Math.floor(widths[name] * ratio);
        entry.node.dataset.dockSide = side;
        entry.node.style.left = side === 'left' ? '0px' : 'auto';
        entry.node.style.right = side === 'right' ? '0px' : 'auto';
        entry.node.style.width = width + 'px';
        if (side === 'left') left += width; else right += width;
      }
      this.doc.documentElement.style.setProperty('--zma-dock-left', left + 'px');
      this.doc.documentElement.style.setProperty('--zma-dock-right', right + 'px');
      this.doc.body.classList.toggle('zma-docks-open', total > 0);
      this.doc.body.classList.toggle('zma-assistant-open', !this.panel.node.hidden);
      this.panel.notion?.browser?.align?.();
      this.panel.fitComposer?.();
      this.panel.quotes?.layout();
    }

    destroy() {
      this.win.removeEventListener('resize', this.onResize);
      this.styleObserver.disconnect();
      for (const cleanup of this.cleanups) cleanup();
      this.hint?.remove();
      this.doc.body.classList.remove('zma-docks-open', 'zma-assistant-open');
      for (const property of ['--zma-dock-left', '--zma-dock-right']) this.doc.documentElement.style.removeProperty(property);
    }
  }

  const api = { normalize, DockController };
  root.ZMADocks = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
