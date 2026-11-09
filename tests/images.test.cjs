const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path').win32;
const { ImageManager } = require('../src/images.js');

const PNG = Uint8Array.from([137,80,78,71,13,10,26,10,0,1]);

function fixture({ readOnly = false, noteHTML = '', embeddedFailure = false } = {}) {
  const files = new Map([
    ['C:\\papers\\figure.png', PNG],
    ['C:\\papers\\paper.pdf', Uint8Array.from([37,80,68,70])],
  ]);
  const notes = new Map();
  const attachments = new Map();
  let nextID = 10;
  const annotation = {
    key: 'ANNOT001', id: 7, parentID: 1, annotationType: 'image',
    annotationPosition: JSON.stringify({ pageIndex: 2, rects: [[1, 2, 3, 4]] }),
    isAnnotation: () => true, isEditable: () => !readOnly,
  };
  const pdf = {
    id: 1, key: 'PDFKEY01', libraryID: 1, parentID: 2,
    getFilePathAsync: async () => 'C:\\papers\\paper.pdf',
  };
  const parent = { id: 2, libraryID: 1, isRegularItem: () => true };
  const byKey = new Map([['ANNOT001', annotation]]);
  const items = {
    get: id => id === 1 ? pdf : id === 2 ? parent : notes.get(id) || attachments.get(id),
    getByLibraryAndKey: (_libraryID, key) => byKey.get(key) || [...notes.values(), ...attachments.values()].find(x => x.key === key),
  };
  const Z = {
    Items: items,
    Item: class {
      constructor(itemType) {
        this.itemType = itemType; this.id = ++nextID; this.key = `NOTE${String(nextID).padStart(4, '0')}`;
        this._note = '';
      }
      isNote() { return this.itemType === 'note'; }
      getNote() { return this._note; }
      setNote(value) { this._note = value; }
      async saveTx() { notes.set(this.id, this); byKey.set(this.key, this); }
      async eraseTx() { notes.delete(this.id); byKey.delete(this.key); }
    },
    Attachments: {
      importEmbeddedImage: async ({ blob, parentItemID }) => {
        if (embeddedFailure) throw new Error('embedded import failed');
        const image = { id: ++nextID, key: 'IMAGE001', parentID: parentItemID, blob, isEmbeddedImageAttachment: () => true, async eraseTx() { attachments.delete(this.id); byKey.delete(this.key); } };
        attachments.set(image.id, image); byKey.set(image.key, image); return image;
      },
    },
  };
  const IO = {
    exists: async p => files.has(p),
    makeDirectory: async () => {},
    read: async p => { if (!files.has(p)) throw new Error(`missing: ${p}`); return files.get(p); },
    write: async (p, bytes) => { if (files.has(p)) throw new Error('exists'); files.set(p, Uint8Array.from(bytes)); },
    remove: async p => { files.delete(p); },
  };
  const P = {
    join: (...parts) => path.join(...parts),
    parent: value => path.dirname(value),
  };
  const host = {
    Z, IO, P,
    scope: () => ({ libraryID: 1, attachmentKey: 'PDFKEY01' }),
    isReadOnly: () => readOnly,
    nativeAnnotation: (_reader, key) => key === annotation.key ? annotation : null,
    sourceLink: () => 'zotero://open-pdf/library/items/PDFKEY01?page=3&annotation=ANNOT001',
    runtimeWindow: () => ({ Blob, crypto: { randomUUID: () => '12345678-1234-4234-8234-123456789abc' }, btoa: value => Buffer.from(value, 'binary').toString('base64') }),
  };
  let uuidNumber=0;host.runtimeWindow=()=>({Blob,crypto:{randomUUID:()=>uuidNumber++===0?'12345678-1234-4234-8234-123456789abc':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},btoa:value=>Buffer.from(value,'binary').toString('base64')});
  if (noteHTML) {
    const note = new Z.Item('note'); note.libraryID = 1; note.parentID = 2; note.key = 'EXIST001'; note._note = noteHTML;
    notes.set(note.id, note); byKey.set(note.key, note);
  }
  return { host, files, notes, attachments, reader: { itemID: 1 } };
}

test('copies a validated image beside the PDF and appends it to the PDF-specific native note', async () => {
  const f = fixture({ noteHTML: '<div data-schema-version="9"><p>已有笔记</p></div>' });
  const state = { images: [], imageNoteKey: 'EXIST001' };
  const record = await new ImageManager(f.host).importImage(f.reader, 'ANNOT001', 'C:\\papers\\figure.png', state);
  assert.equal(record.fileName, 'margin-comment-12345678123442348234123456789abc.png');
  const copy = 'C:\\papers\\margin-comments-images\\' + record.fileName;
  assert.deepEqual([...f.files.get(copy)], [...PNG]);
  assert.equal(record.noteKey, 'EXIST001');
  assert.equal(record.noteImageKey, 'IMAGE001');
  const note = [...f.notes.values()].find(item => item.key === 'EXIST001');
  assert.match(note.getNote(), /已有笔记/);
  assert.match(note.getNote(), /data-attachment-key="IMAGE001"/);
  assert.match(note.getNote(), /zotero:\/\/open-pdf\/library\/items\/PDFKEY01\?page=3&amp;annotation=ANNOT001/);
  assert.equal(state.images[0], record);
  assert.equal(state.imageNoteKey, 'EXIST001');
});

test('rejects readonly PDFs, missing annotations, and bytes that do not match an allowed image', async () => {
  const readonly = fixture({ readOnly: true });
  await assert.rejects(new ImageManager(readonly.host).importImage(readonly.reader, 'ANNOT001', 'C:\\papers\\figure.png', { images: [] }), /只读/);
  const noAnnotation = fixture();
  await assert.rejects(new ImageManager(noAnnotation.host).importImage(noAnnotation.reader, 'MISSING1', 'C:\\papers\\figure.png', { images: [] }), /批注/);
  const bad = fixture(); bad.files.set('C:\\papers\\figure.png', Uint8Array.from([1, 2, 3]));
  await assert.rejects(new ImageManager(bad.host).importImage(bad.reader, 'ANNOT001', 'C:\\papers\\figure.png', { images: [] }), /图片格式/);
});

test('cleans only its own image copy when Zotero cannot import the embedded image', async () => {
  const f = fixture({ embeddedFailure: true });
  await assert.rejects(new ImageManager(f.host).importImage(f.reader, 'ANNOT001', 'C:\\papers\\figure.png', { images: [] }), /embedded import failed/);
  assert.equal([...f.files.keys()].some(p => p.includes('margin-comments-images')), false);
  assert.equal(f.notes.size, 0);
});

test('readImage confines reads to the generated image folder and returns a data URL', async () => {
  const f = fixture();
  const manager = new ImageManager(f.host);
  const record = { fileName: 'margin-comment-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', mime: 'image/png' };
  f.files.set('C:\\papers\\margin-comments-images\\' + record.fileName, PNG);
  assert.equal(await manager.readImage(f.reader, record), `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
  await assert.rejects(manager.readImage(f.reader, { ...record, fileName: '..\\secret.png' }), /图片记录无效/);
});

test('concurrent inserts into one PDF serialize and preserve both images in one native note',async()=>{
  const f=fixture(),manager=new ImageManager(f.host),state={images:[]};let imageNumber=0;
  const nativeImport=f.host.Z.Attachments.importEmbeddedImage;
  f.host.Z.Attachments.importEmbeddedImage=async options=>{await new Promise(r=>setTimeout(r,10));const image=await nativeImport(options);image.key='IMAGE00'+(++imageNumber);return image;};
  await Promise.all([manager.importImage(f.reader,'ANNOT001','C:\\papers\\figure.png',state),manager.importImage(f.reader,'ANNOT001','C:\\papers\\figure.png',state)]);
  assert.equal(f.notes.size,1);assert.equal(state.images.length,2);
  const note=[...f.notes.values()][0];assert.match(note.getNote(),/data-attachment-key="IMAGE001"/);assert.match(note.getNote(),/data-attachment-key="IMAGE002"/);
});

test('local index commit failure restores the existing native note and removes only this import',async()=>{
  const original='<div data-schema-version="9"><p>已有笔记</p></div>',f=fixture({noteHTML:original}),manager=new ImageManager(f.host),state={images:[],imageNoteKey:'EXIST001'};
  await assert.rejects(manager.importImage(f.reader,'ANNOT001','C:\\papers\\figure.png',state,async()=>{throw new Error('index disk full');}),/index disk full/);
  assert.equal(state.images.length,0);assert.equal(state.imageNoteKey,'EXIST001');assert.equal(f.notes.size,1);assert.equal(f.attachments.size,0);assert.equal([...f.notes.values()][0].getNote(),original);assert.equal([...f.files.keys()].some(p=>p.includes('margin-comments-images')),false);
});
