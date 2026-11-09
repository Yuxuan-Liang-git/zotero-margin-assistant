(function(root){
 'use strict';
 const C=root.ZMACore||(typeof require!=='undefined'?require('./core.js'):null),MAX_BYTES=6*1024*1024;
 function format(bytes){
  if(!bytes?.length||bytes.length>MAX_BYTES)throw new Error('附件大小须为 1 字节至 6 MiB');
  if(bytes.length>=5&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-')return {mime:'application/pdf',extension:'pdf'};
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return {mime:'image/png',extension:'png'};
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',extension:'jpg'};
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return {mime:'image/webp',extension:'webp'};
  throw new Error('附件格式不支持：请选择 PDF、PNG、JPEG 或 WebP');
 }
 class AttachmentManager{
  constructor(host){this.host=host;}
  async directory(reader){const h=this.host,pdf=await h.Z.Items.get(Number(reader.itemID))?.getFilePathAsync();if(!pdf)throw new Error('当前 PDF 文件缺失');return h.P.join(h.P.parent?h.P.parent(pdf):h.P.dirname(pdf),'margin-comments-chat-files');}
  async readInput(input){
   const h=this.host,unwrap=h.unwrap||((value)=>value);
   if(input.path)return h.IO.read(input.path);if(input.bytes&&typeof input.bytes!=='function')return input.bytes;
   const Reader=h.runtimeWindow().FileReader;
   if(Reader?.prototype?.readAsArrayBuffer)return new Promise((resolve,reject)=>{const reader=new Reader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('附件读取失败'));reader.readAsArrayBuffer(input);});
   return unwrap(await unwrap(input.arrayBuffer()));
  }
  async import(reader,input){
   const h=this.host,unwrap=h.unwrap||((value)=>value);input=unwrap(input);if(h.isReadOnly(reader))throw new Error('当前文献为只读，无法保存附件');
   let size=input.size;if(input.path&&h.IO.stat)size=(await h.IO.stat(input.path)).size;if(size!==undefined&&(!Number.isSafeInteger(size)||size<1||size>MAX_BYTES))throw new Error('附件大小须为 1 字节至 6 MiB');
   const raw=unwrap(await this.readInput(input)),bytes=ArrayBuffer.isView(raw)?new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength):new Uint8Array(raw),kind=format(bytes);
   const win=h.runtimeWindow(),id=win.crypto.randomUUID?win.crypto.randomUUID().replace(/-/g,'').toLowerCase():Array.from(win.crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''),fileName=`chat-${id}.${kind.extension}`;
   const name=String(input.name||input.path?.split(/[\\/]/).pop()||`粘贴附件.${kind.extension}`).replace(/[\\/\x00-\x1f]/g,'_').slice(0,240)||`附件.${kind.extension}`;
   const record=C.pickAttachment({id,name,mime:kind.mime,fileName,size:bytes.length}),dir=await this.directory(reader);await h.IO.makeDirectory(dir,{ignoreExisting:true});await h.IO.write(h.P.join(dir,fileName),bytes);return record;
  }
  async load(reader,value){
   const record=C.pickAttachment(value),h=this.host,path=h.P.join(await this.directory(reader),record.fileName);
   if(h.IO.stat&&(await h.IO.stat(path)).size!==record.size)throw new Error('附件副本大小已改变，请重新添加');
   const bytes=await h.IO.read(path);if(bytes.length!==record.size||format(bytes).mime!==record.mime)throw new Error('附件副本已改变，请重新添加');
   const win=h.runtimeWindow(),blob=new win.Blob([bytes],{type:record.mime});const dataURL=await new Promise((resolve,reject)=>{const reader=new win.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('附件读取失败'));reader.readAsDataURL(blob);});return {...record,dataURL};
  }
 }
 const api={AttachmentManager,format,MAX_BYTES};root.ZMAAttachments=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
