const {test}=require('node:test'),assert=require('node:assert/strict');
const {listen}=require('../src/chatgpt-native.js');
test('native callback accepts the advertised IPv4 host, rejects foreign hosts and closes once',async()=>{
  let server,seen=0;class HttpServer{
    constructor(){server=this;this.identity={primaryPort:45678,hosts:new Set()};this.stops=0;}
    registerPrefixHandler(_path,handler){this.handler=handler;}
    // Gecko's _initialize makes localhost primary; only normal start adds IPv4.
    _start(_port,host){this.identity.hosts.add('localhost');if(host!=='127.0.0.1')this.identity.hosts.add('127.0.0.1');}
    start(port){this._start(port,'localhost');}
    stop(callback){this.stops++;callback();}
  }
  const listener=await listen(HttpServer,URL,()=>{seen++;return {status:200};});assert.ok(server.identity.hosts.has(new URL(listener.redirectURI).hostname),'advertised loopback callback must be recognized by Gecko');
  function request(host){return new Promise(resolve=>{const response={processAsync(){},setStatusLine(_version,status){this.status=status;},setHeader(){},write(){},finish(){resolve(this.status);}};server.handler({method:'GET',getHeader:()=>host,path:'/auth/callback',queryString:'state=qa',httpVersion:'1.1'},response);});}
  assert.equal(await request('evil.test:45678'),404);assert.equal(seen,0);assert.equal(await request('127.0.0.1:45678'),200);assert.equal(seen,1);await listener.close();await listener.close();assert.equal(server.stops,1);
});
