(function(root){
  'use strict';
  // Locate Markdown block boundaries without splitting math or fenced/inline code.
  function analyze(text,limit=4096){
    let mode=null,lastSpace=0;
    for(let i=0;i<text.length;i++){
      const char=text[i],atLine=()=>/^ {0,3}$/.test(text.slice(text.lastIndexOf('\n',i-1)+1,i));
      if(mode?.kind==='math'){
        if(text.startsWith(mode.close,i)){
          i+=mode.close.length-1;const display=mode.display;mode=null;if(display)return {cut:i+1,safe:0};
        }else if(char==='\\')i++;else if(char==='\n'&&mode.close==='$')mode=null;
        continue;
      }
      if(mode?.kind==='code'){
        if(char===mode.char){let end=i;while(text[end]===char)end++;if(end-i>=mode.count&&(!mode.fence||atLine()))mode=null;i=end-1;}continue;
      }
      if(char==='\\'){
        if(text[i+1]==='['||text[i+1]==='('){mode={kind:'math',start:i,close:text[i+1]==='['?'\\]':'\\)',display:text[i+1]==='['&&atLine()};i++;}else i++;continue;
      }
      if(char==='`'||char==='~'&&atLine()){
        let end=i;while(text[end]===char)end++;const count=end-i;
        if(char==='`'||count>=3)mode={kind:'code',char,count,fence:count>=3&&atLine(),start:i};i=end-1;continue;
      }
      if(char==='$'&&text[i+1]&&!/\s/.test(text[i+1])){const display=text[i+1]==='$';mode={kind:'math',start:i,close:display?'$$':'$',display:display&&atLine()};if(display)i++;continue;}
      if(char==='\n'&&/^\s*$/.test(text.slice(text.lastIndexOf('\n',i-1)+1,i)))return {cut:i+1,safe:0};
      if(/\s/.test(char))lastSpace=i+1;
      if(i>=limit&&!mode){let cut=lastSpace||i;if(cut>0&&/[\uDC00-\uDFFF]/.test(text[cut]||''))cut--;return {cut,safe:0};}
    }
    return {cut:0,safe:mode?mode.start:text.length};
  }
  class LiveRenderer{
    constructor(node,render,{interval=180,before=()=>false,after=(_state)=>{}}={}){
      this.node=node;this.render=render;this.interval=interval;this.before=before;this.after=after;this.buffer='';this.source='';this.previewSource='';this.closed=false;this.timer=null;
      const create=()=>node.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml','div');
      this.stable=create();this.rich=create();this.raw=create();this.raw.style.whiteSpace='pre-wrap';this.rawText=node.ownerDocument.createTextNode('');this.raw.append(this.rawText);node.replaceChildren(this.stable,this.rich,this.raw);
    }
    append(delta){if(this.closed)return;this.buffer+=delta;this.source+=delta;this.rawText.appendData(delta);this.schedule();}
    schedule(){if(!this.closed&&this.timer===null)this.timer=setTimeout(()=>{this.timer=null;this.flush();},this.interval);}
    flush(){
      if(this.closed||!this.node.isConnected)return;
      const selection=this.node.ownerDocument.defaultView.getSelection();
      if(selection&&!selection.isCollapsed&&(this.node.contains(selection.anchorNode)||this.node.contains(selection.focusNode))){this.schedule();return;}
      const state=this.before();let blocks=0,part;
      while(blocks<2&&(part=analyze(this.buffer)).cut){
        const block=this.node.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml','div');this.render(block,this.buffer.slice(0,part.cut));this.stable.append(block);this.buffer=this.buffer.slice(part.cut);blocks++;
      }
      part=analyze(this.buffer);const end=part.cut?0:part.safe,preview=this.buffer.slice(0,end);
      if(preview!==this.previewSource||blocks){if(preview)this.render(this.rich,preview);else this.rich.replaceChildren();this.previewSource=preview;}
      this.rawText.data=this.buffer.slice(end);this.after(state);if(part.cut)this.schedule();
    }
    finish(){this.closed=true;clearTimeout(this.timer);this.timer=null;}
  }
  const api={LiveRenderer,analyze};root.ZMAStreaming=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
