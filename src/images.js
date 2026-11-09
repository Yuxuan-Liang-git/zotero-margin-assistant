(function(root) {
  'use strict';

  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const FORMATS = [
    { mime: 'image/png', extension: 'png', test: b => b.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v) },
    { mime: 'image/jpeg', extension: 'jpg', test: b => b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255 },
    { mime: 'image/gif', extension: 'gif', test: b => b.length >= 6 && String.fromCharCode(...b.slice(0,6)).match(/^GIF8[79]a$/) },
    { mime: 'image/webp', extension: 'webp', test: b => b.length >= 12 && String.fromCharCode(...b.slice(0,4)) === 'RIFF' && String.fromCharCode(...b.slice(8,12)) === 'WEBP' },
  ];
  const FILE_NAME = /^margin-comment-([a-f0-9]{32})\.(png|jpg|gif|webp)$/;
  const KEY = /^[A-Z0-9]{8}$/;

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') return new Uint8Array(value);
    throw new Error('图片文件无法读取');
  }

  function identify(bytes) {
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('图片大小必须为 1 字节至 10 MiB');
    const format = FORMATS.find(candidate => candidate.test(bytes));
    if (!format) throw new Error('图片格式无效：仅支持 PNG、JPEG、GIF 和 WebP');
    return format;
  }

  function appendNoteHTML(existing, addition) {
    const html = String(existing || '');
    const rootStart = /^\s*(<div\b[^>]*\bdata-schema-version=["'][^"']+["'][^>]*>)/i.exec(html);
    if (rootStart) {
      const closeAt = html.toLowerCase().lastIndexOf('</div>');
      if (closeAt >= rootStart[0].length) return html.slice(0, closeAt) + addition + html.slice(closeAt);
    }
    return `<div data-schema-version="9">${html}${addition}</div>`;
  }

  class ImageManager {
    constructor(host) { this.host = host; this.queues=new Map(); }

    async flush() { await Promise.allSettled([...this.queues.values()]); }

    async waitFor(reader) {
      const scope = this.host.scope(reader), key = `${scope.libraryID}:${scope.attachmentKey}`;
      while (this.queues.has(key)) { try { await this.queues.get(key); } catch {} }
    }

    async readImageInput(sourcePath) {
      const { host } = this;
      let input = typeof sourcePath === 'string' ? { path: sourcePath } : sourcePath;
      if (host.unwrap) input = host.unwrap(input);
      if (!input || typeof input !== 'object') throw new Error('图片文件无效');
      if (input.path !== undefined && (typeof input.path !== 'string' || !input.path.trim())) throw new Error('图片文件无效');
      let size = input.size ?? input.bytes?.byteLength;
      if (input.path && host.IO.stat) size = (await host.IO.stat(input.path)).size;
      if (size !== undefined && (!Number.isSafeInteger(size) || size < 1 || size > MAX_IMAGE_BYTES)) throw new Error('图片大小必须为 1 字节至 10 MiB');
      const raw = host.attachmentManager ? await host.attachmentManager.readInput(input) : input.path ? await host.IO.read(input.path) : input.bytes;
      const bytes = asBytes(host.unwrap ? host.unwrap(raw) : raw), format = identify(bytes);
      return { bytes, mime: format.mime, extension: format.extension };
    }

    _assertActive(reader) {
      if (this.host.running === false || this.host.closedReaders?.has(reader)) throw new Error('图片插入已停止');
      if (this.host.isReadOnly(reader)) throw new Error('此文献库为只读，无法保存图片');
    }

    _assertWritable(reader, annotationKey, position) {
      this._assertActive(reader);
      const annotation = this.host.nativeAnnotation(reader, annotationKey);
      if (!annotation || annotation.deleted || annotation.isEditable?.() === false) throw new Error('目标批注不存在或为只读');
      if (position !== undefined) {
        const current = typeof annotation.annotationPosition === 'string' ? JSON.parse(annotation.annotationPosition) : annotation.annotationPosition;
        if (JSON.stringify(current) !== position) throw new Error('目标批注位置已改变，请重新插入图片');
      }
      return annotation;
    }

    async _resolveTarget(reader, target, expectedPosition) {
      if (typeof target === 'string') {
        if (!KEY.test(target)) throw new Error('目标批注无效');
        const annotation = this._assertWritable(reader, target, expectedPosition);
        const position = typeof annotation.annotationPosition === 'string' ? JSON.parse(annotation.annotationPosition) : annotation.annotationPosition;
        if (!Number.isSafeInteger(position?.pageIndex) || position.pageIndex < 0) throw new Error('批注页面位置无效');
        return { source: { annotationKey: target, pageIndex: position.pageIndex, rects: position.rects }, position: JSON.stringify(position) };
      }
      this._assertActive(reader);
      if (!Number.isSafeInteger(target?.pageIndex) || target.pageIndex < 0 || typeof target.fingerprint !== 'string' || !target.fingerprint) throw new Error('页面图片目标无效');
      const info = await this.host.pageImageInfo(reader);
      this._assertActive(reader);
      if (info.fingerprint !== target.fingerprint) throw new Error('PDF 文件已经改变，请重新插入图片');
      if (target.pageIndex >= info.pageCount) throw new Error('页面图片页码无效');
      return { source: { pageIndex: target.pageIndex, fullPage: true }, position: undefined };
    }

    async _pdfPath(reader) {
      const item = this.host.Z.Items.get(Number(reader.itemID));
      const filePath = await item?.getFilePathAsync?.();
      if (!filePath) throw new Error('PDF 附件文件缺失');
      return filePath;
    }

    _parentID(attachment) {
      const parent = attachment.parentID ? this.host.Z.Items.get(attachment.parentID) : null;
      return parent && parent.isRegularItem?.() !== false ? parent.id : null;
    }

    _nativeNote(state, attachment) {
      const parentID = this._parentID(attachment);
      if (state.imageNoteKey) {
        const note = this.host.Z.Items.getByLibraryAndKey(attachment.libraryID, state.imageNoteKey);
        if (!note?.isNote?.() || note.deleted || Number(note.parentID || 0) !== Number(parentID || 0)) throw new Error('图片笔记记录已失效');
        return { note, isNew: false, parentID };
      }
      const note = new this.host.Z.Item('note');
      note.libraryID = attachment.libraryID;
      if (parentID) note.parentID = parentID;
      const title = String(attachment.getField?.('title') || '当前 PDF').slice(0, 240);
      note.setNote(`<div data-schema-version="9"><p><strong>页边批注图片：${escapeHTML(title)}</strong></p></div>`);
      return { note, isNew: true, parentID };
    }

    async transaction(reader, action) {
      const scope=this.host.scope(reader),key=`${scope.libraryID}:${scope.attachmentKey}`;
      const task=(this.queues.get(key)||Promise.resolve()).catch(()=>{}).then(action);
      this.queues.set(key,task);try{return await task;}finally{if(this.queues.get(key)===task)this.queues.delete(key);}
    }

    importImage(reader, target, sourcePath, state, commit=async()=>{}) {
      return this.transaction(reader, () => this._importImage(reader, target, sourcePath, state, commit));
    }

    async _importImage(reader, target, sourcePath, state, commit) {
      const { host } = this;
      if (!state || typeof state !== 'object') throw new Error('图片状态无效');
      if (state.images !== undefined && !Array.isArray(state.images)) throw new Error('图片记录数据损坏');
      if (state.imageNoteKey && (typeof state.imageNoteKey !== 'string' || !KEY.test(state.imageNoteKey))) throw new Error('图片笔记记录无效');
      const resolved = await this._resolveTarget(reader, target);
      const pdfScope = host.scope(reader);
      const source = { ...pdfScope, ...resolved.source };
      const pdfAttachment = host.Z.Items.get(Number(reader.itemID));
      const link = host.sourceLink(source);
      const format = await this.readImageInput(sourcePath), bytes = format.bytes;
      await this._resolveTarget(reader, target, resolved.position);
      const win = host.runtimeWindow();
      const imageDir = host.P.join(host.P.parent(await this._pdfPath(reader)), 'margin-comments-images');
      await host.IO.makeDirectory(imageDir, { ignoreExisting: true });

      const uuid = win.crypto.randomUUID().replace(/-/g, '').toLowerCase();
      const fileName = `margin-comment-${uuid}.${format.extension}`;
      const copiedPath = host.P.join(imageDir, fileName);
      let copyOwned = false, embedded = null, noteInfo = null, originalNote = null,record = null;
      const oldNoteKey=state.imageNoteKey,oldImages=state.images,oldImageCount=oldImages?.length||0,oldVersion=state.version;
      try {
        if (await host.IO.exists(copiedPath)) throw new Error('图片文件名冲突，请重试');
        copyOwned = true;
        await host.IO.write(copiedPath, bytes);

        noteInfo = this._nativeNote(state, pdfAttachment);
        const note = noteInfo.note;
        if (noteInfo.isNew) await note.saveTx();
        else originalNote = String(note.getNote?.() || '');

        const blob = new win.Blob([bytes], { type: format.mime });
        embedded = await host.Z.Attachments.importEmbeddedImage({ blob, parentItemID: note.id });
        const pdfTitle = String(pdfAttachment.getField?.('title') || '当前 PDF').slice(0, 240);
        const linkHTML = `<p><a href="${escapeHTML(link)}">${escapeHTML(`来源：${pdfTitle} · 第 ${source.pageIndex + 1} 页`)}</a></p>`;
        const imageHTML = `<p><img data-attachment-key="${escapeHTML(embedded.key)}" /></p>`;
        const content = `${linkHTML}${imageHTML}`;
        note.setNote(appendNoteHTML(noteInfo.isNew ? note.getNote() : originalNote, content));
        await note.saveTx();
        await this._resolveTarget(reader, target, resolved.position);
        this._assertActive(reader);

        record = {
          id: uuid,
          ...(typeof target === 'string' ? { annotationKey: target } : { sourcePageIndex: source.pageIndex }),
          fileName,
          mime: format.mime,
          noteKey: note.key,
          noteImageKey: embedded.key,
        };
        state.images ||= [];
        state.images.push(record);
        state.imageNoteKey = note.key;
        if (typeof target !== 'string') state.version = 3;
        await commit(record);
        return record;
      }
      catch (error) {
        if(record){if(oldImages){oldImages.length=oldImageCount;state.images=oldImages;}else delete state.images;state.imageNoteKey=oldNoteKey;if(oldVersion===undefined)delete state.version;else state.version=oldVersion;}
        if (noteInfo && !noteInfo.isNew && originalNote !== null) {
          try { noteInfo.note.setNote(originalNote); await noteInfo.note.saveTx(); } catch {}
        }
        if (embedded) await this._eraseOwnedItem(embedded);
        if (noteInfo?.isNew && noteInfo.note.id) await this._eraseOwnedItem(noteInfo.note);
        if (copyOwned) { try { await host.IO.remove(copiedPath); } catch {} }
        throw error;
      }
    }

    async _eraseOwnedItem(item) {
      try {
        if (this.host.Z.DB?.executeTransaction) await this.host.Z.DB.executeTransaction(() => item.eraseTx());
        else await item.eraseTx?.();
      }
      catch {}
    }

    async readBytes(reader, record) {
      if (!record || typeof record !== 'object') throw new Error('图片记录无效');
      const match = typeof record.fileName === 'string' && FILE_NAME.exec(record.fileName);
      const format = FORMATS.find(x => x.mime === record.mime);
      if (!match || !format || match[2] !== format.extension) throw new Error('图片记录无效');
      const filePath = await this._pdfPath(reader);
      const target = this.host.P.join(this.host.P.parent(filePath), 'margin-comments-images', record.fileName);
      const bytes = asBytes(await this.host.IO.read(target));
      if (identify(bytes).mime !== format.mime) throw new Error('图片记录无效');
      return { bytes, mime: format.mime };
    }

    async readImage(reader, record) {
      const { bytes, mime } = await this.readBytes(reader, record);
      return this.dataURL(bytes, mime);
    }

    dataURL(bytes, mime) {
      const binary = [];
      for (let i = 0; i < bytes.length; i += 0x8000) binary.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
      return `data:${mime};base64,${this.host.runtimeWindow().btoa(binary.join(''))}`;
    }
  }

  const api = { ImageManager };
  root.ZMAImages = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
