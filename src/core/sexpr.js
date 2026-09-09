/** Bounded, non-evaluating KiCad S-expression reader. No regex-based tree parsing.
 * Strings remain strings, including numeric pin identifiers and Unicode names. */
export function parseSExpression(text, {maxBytes=5*1024*1024, maxNodes=400000, maxDepth=64}={}) {
  for (const [key,value,cap] of [['maxBytes',maxBytes,5*1024*1024],['maxNodes',maxNodes,400000],['maxDepth',maxDepth,128]]) {
    if (!Number.isSafeInteger(value)||value<1||value>cap) throw new Error(`Invalid ${key} budget`);
  }
  if (typeof text!=='string'||new TextEncoder().encode(text).length>maxBytes||text.includes('\0')) throw new Error('Expected NUL-free text within the byte budget');
  let i=text.charCodeAt(0)===0xFEFF?1:0,count=0,root=null;
  const stack=[];
  function append(value) {
    if (++count>maxNodes) throw new Error('S-expression node budget exceeded');
    if (stack.length) stack.at(-1).push(value);
    else if (root===null) root=value;
    else throw new Error('More than one S-expression root');
  }
  while (i<text.length) {
    const c=text[i];
    if (/\s/.test(c)) {i++;continue;}
    if (c===';') {while(i<text.length&&text[i]!=='\n')i++;continue;}
    if (c==='(') {const node=[];append(node);stack.push(node);if(stack.length>maxDepth)throw new Error('S-expression depth budget exceeded');i++;continue;}
    if (c===')') {if(!stack.length)throw new Error(`Unmatched closing parenthesis at ${i}`);stack.pop();i++;continue;}
    let word='';
    if (c==='"') {
      i++;let closed=false;
      while(i<text.length) {
        const q=text[i++];
        if(q==='"'){closed=true;break;}
        if(q==='\\') {
          const e=text[i++],esc={'"':'"','\\':'\\','n':'\n','r':'\r','t':'\t'};
          if(!Object.hasOwn(esc,e))throw new Error('Unsupported string escape');
          word+=esc[e];
        } else {if(q.charCodeAt(0)<32)throw new Error('Unescaped control character in string');word+=q;}
      }
      if(!closed)throw new Error('Unterminated quoted string');
      if(i<text.length&&!/[\s();]/.test(text[i]))throw new Error('Missing separator after quoted string');
    } else {
      while(i<text.length&&!/[\s();]/.test(text[i])) {
        if(text[i]==='"'||text.charCodeAt(i)<32)throw new Error('Invalid unquoted atom');
        word+=text[i++];
      }
      if(!word)throw new Error(`Invalid token at ${i}`);
    }
    append(word);
  }
  if(stack.length||!Array.isArray(root)||!root.length)throw new Error('Incomplete or empty S-expression');
  return root;
}
export function children(node, name) {return node.filter(v=>Array.isArray(v)&&v[0]===name);}
export function singleton(node,name,required=false) {
  const found=children(node,name);
  if(found.length>1||required&&!found.length)throw new Error(`Expected ${required?'exactly':'at most'} one ${name}`);
  return found[0];
}
export function finiteDecimal(value, label='number') {
  if(typeof value!=='string'||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))throw new Error(`Invalid ${label}`);
  const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1e6)throw new Error(`${label} out of range`);return n;
}
export function identifier(value, label='identifier', empty=false) {
  if(typeof value!=='string'||(!empty&&!value.length)||value.length>512||/[\u0000-\u001f\u007f]/.test(value))throw new Error(`Invalid ${label}`);
  if(new TextDecoder().decode(new TextEncoder().encode(value))!==value)throw new Error(`Malformed Unicode in ${label}`);
  return value;
}
