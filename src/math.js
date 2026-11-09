(function(root){
  'use strict';
  function normalizeDisplay(expression,display){
    if(!display)return expression;let braces=0,environments=0,lineBreak=false,alignment=false;
    for(let i=0;i<expression.length;i++){
      const environment=/^\\(begin|end)\s*\{[^}]+\}/.exec(expression.slice(i));
      if(environment){environments=Math.max(0,environments+(environment[1]==='begin'?1:-1));i+=environment[0].length-1;continue;}
      if(expression[i]==='\\'){if(expression[i+1]==='\\'){if(!braces&&!environments)lineBreak=true;i++;}else if(expression[i+1]==='{'||expression[i+1]==='}'||expression[i+1]==='&')i++;continue;}
      if(expression[i]==='{')braces++;else if(expression[i]==='}')braces=Math.max(0,braces-1);else if(expression[i]==='&'&&!braces&&!environments)alignment=true;
    }
    if(!lineBreak)return expression;const environment=alignment?'aligned':'gathered';return `\\begin{${environment}}${expression}\\end{${environment}}`;
  }
  // CJK punctuation in otherwise valid math uses a text glyph; retain every
  // other strict diagnostic and the renderer's untrusted-command restrictions.
  function strict(code){return code==='unicodeTextInMathMode'?'ignore':'error';}
  root.ZMAMath={normalizeDisplay,strict};if(typeof module!=='undefined')module.exports=root.ZMAMath;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
