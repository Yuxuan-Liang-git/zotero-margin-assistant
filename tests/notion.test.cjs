const {test}=require('node:test'),assert=require('node:assert/strict');
const modulePath='../src/notion.js';
const id='0123456789abcdef0123456789abcdef',other='fedcba9876543210fedcba9876543210';
test('Notero links normalize to HTTPS and retain page, query and block locations',()=>{
 const N=require(modulePath);for(const domain of ['www.notion.so','app.notion.com','notion.so','workspace.notion.site']){
  assert.equal(N.normalizeURL(`notion://${domain}/Paper-${id}?pvs=21#${other}`),`https://${domain}/Paper-${id}?pvs=21#${other}`);
 }
 assert.equal(N.normalizeURL(`https://www.notion.so/Paper-01234567-89ab-cdef-0123-456789abcdef`),`https://www.notion.so/Paper-01234567-89ab-cdef-0123-456789abcdef`);
});
test('unsafe URLs and unrelated Notion navigation are rejected before a browser is created',()=>{
 const N=require(modulePath);for(const url of [`https://www.notion.so.evil.test/${id}`,`https://notion.so@evil.test/${id}`,`https://user:password@notion.so/${id}`,`http://notion.so/${id}`,`https://notion.so:444/${id}`,'javascript:alert(1)','file:///private.pdf','https://www.notion.so/login','https://www.notion.com/help'])assert.equal(N.normalizeURL(url),null,url);
});
function fixture(){
 const item=(n,url,extra={})=>({id:n,libraryID:1,isAttachment:()=>true,getField:k=>k==='url'?url:'Notion',...extra});
 const items=new Map([[1,{id:1,parentID:10,libraryID:1}],[2,{id:2,parentID:20,libraryID:1}],[3,{id:3,libraryID:1}],[10,{id:10,libraryID:1,getAttachments:()=>[11,12,13,14,15]}],[20,{id:20,libraryID:1,getAttachments:()=>[21]}],
  [11,item(11,`https://www.notion.so/Old-${id}`)],[12,item(12,`notion://www.notion.so/Paper-${id}?pvs=4`)],[13,item(13,`https://app.notion.com/${other}`)],[14,item(14,`https://notion.so/${id}`,{deleted:true})],[15,item(15,`https://notion.so/${id}`,{libraryID:2})],[21,item(21,'https://example.com/')]]);
 return {items,Z:{Items:{get:n=>items.get(n)}}};
}
test('each PDF resolves only its parent paper links, newest first, without duplicate Notero pages',async()=>{
 const N=require(modulePath),f=fixture(),links=await N.linksForReader(f.Z,{itemID:1});assert.deepEqual(links.map(x=>x.id),[13,12]);assert.match(links[1].url,/^https:/);assert.equal(links[0].title,'Notion');assert.deepEqual(await N.linksForReader(f.Z,{itemID:2}),[]);assert.deepEqual(await N.linksForReader(f.Z,{itemID:3}),[]);
});
test('link discovery is read-only and deleted or missing parent items have no association',async()=>{
 const N=require(modulePath),f=fixture();f.items.get(10).getAttachments=()=>{throw Error('data unavailable');};await assert.rejects(N.linksForReader(f.Z,{itemID:1}),/unavailable/);f.items.get(10).deleted=true;assert.deepEqual(await N.linksForReader(f.Z,{itemID:1}),[]);f.items.delete(10);assert.deepEqual(await N.linksForReader(f.Z,{itemID:1}),[]);
});
