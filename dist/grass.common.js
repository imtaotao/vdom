'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var document = _interopDefault(require('global/document'));
var applyProperties = _interopDefault(require('virtual-dom/vdom/apply-properties'));
var isVNode = _interopDefault(require('virtual-dom/vnode/is-vnode'));
var isVText = _interopDefault(require('virtual-dom/vnode/is-vtext'));
var isWidget = _interopDefault(require('virtual-dom/vnode/is-widget'));
var handleThunk = _interopDefault(require('virtual-dom/vnode/handle-thunk'));
var virtualDom = require('virtual-dom');

function typeOf (val) {
  return Object.prototype.toString.call(val)
}

function isString (str) {
  return typeOf(str) === '[object String]'
}

function isPlainObject (obj) {
  return typeOf(obj) === '[object Object]'
}

function isFunction (fun) {
  return typeOf(fun) === '[object Function]'
}

function isPrimitive (value) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'symbol' ||
    typeof value === 'boolean'
  )
}

function isGeneratorFunction (fun) {
  const constructor = fun.constructor;
  if (!constructor) return false
  if (constructor.name === 'GeneratorFunction' || constructor.displayName === 'GeneratorFunction') {
    return true
  }
  const prototype = constructor.prototype;
  return typeof prototype.next === 'function' && typeof prototype.throw === 'function'
}

function each (arr, cb) {
  let i = 0;
  // Deal array and like-array
  if (Array.isArray(arr) || arr.length) {
    const length = arr.length;
    for (; i < length; i++) {
      if (cb(arr[i], i) === false) return
    }
    return
  }

  // Deal object
  if (isPlainObject(arr)) {
    const keyName = Object.keys(arr);
    const length  = keyName.length;
    for (; i < length; i++) {
      if (cb(arr[keyName[i]], keyName[i]) === false) {
        return
      }
    }
  }
}

const hasOwnProperty = Object.prototype.hasOwnProperty;
function hasOwn (obj, key) {
  return hasOwnProperty.call(obj, key)
}

function toString (val) {
  return val == null
    ? ''
    : typeof val === 'object'
      ? JSON.stringify(val, null, 2)
      : String(val)
}

function isEmptyObj (obj) {
  for (const val in obj) {
    return false
  }
  return true
}

function setOnlyReadAttr (obj, key, val) {
  Object.defineProperty(obj, key, {
    get () { return val }
  });
}

function isUndef (val) {
  return val === undefined || val === null
}

function warn (msg, noError) {
  const errorInfor = `[Grass tip]: ${msg}`;
  if (noError) {
    console.warn(errorInfor);
    return
  }

  throw Error(errorInfor)
}

// 用 原型链 模仿 作用域链

let scope = null;
let chain = [scope];

function create (s) {
  if (s) {
    Object.setPrototypeOf(s, scope);
    chain.push(s);
    return s
  }

  scope = Object.create(scope);
  chain.push(scope);
  return scope
}

function add (key, val) {
  if (typeof key !== 'string') {
    warn('The variable name of the "for" scope must be a "string"');
    return
  }
  scope[key] = val;
}

function destroy () {
  if (scope === null) {
    return scope
  }
  chain.pop();
  scope = chain[chain.length - 1];
  return scope
}

function getScope () {
  return scope
}

function insertChain (obj) {
  if (!isLegScope(obj)) {
    warn('Insert "scope" must be a "object"');
    return
  }
  if (scope === null) return obj

  const ancestor = chain[1];

  if (obj !== ancestor) {
    Object.setPrototypeOf(ancestor, obj);
    chain.splice(1, 0, obj);
  }

  return scope
}

function resetScope () {
  scope = null;
  chain = [scope];
}

function isLegScope (obj) {
  if (isPlainObject(obj)) {
    const prototype = Object.getPrototypeOf(obj);
    return prototype === null || prototype === Object.prototype
  }
  return false
}

var scope$1 = {
  add,
  create,
  destroy,
  getScope,
  resetScope,
  insertChain,
};

function runExecuteContext (runCode, directName, tagName, comp, callback) {
  const insertScope = comp.noStateComp
      ? comp.props
      : comp.state;

  const state = scope$1.insertChain(insertScope || {});

  if (directName !== '{{ }}') {
    directName = 'v-' + directName;
  }

  return run(runCode, directName, tagName, comp, callback, state)
}

function run (runCode, directName, tagName, comp, callback, state) {
  try {
    const fun = new Function('$obj_', '$callback_', '$scope_', runCode);
    return fun.call(comp, state, callback, scope$1)

  } catch (error) {
    warn(`Component directive compilation error  \n\n  "${directName}":  ${error}\n\n
    --->  ${comp.name}: <${tagName || ''}/>\n`);
  }
}

const styleString = /\{[^\}]*\}/;

function bind (props, comp, vnodeConf$$1) {
  if (!Array.isArray(props)) {
    dealSingleBindAttr(props, comp, vnodeConf$$1);
    return
  }

  for (const prop of props) {
    dealSingleBindAttr(prop, comp, vnodeConf$$1);
  }

  // 我们对 attrs 做处理，使其能够适用 virtual-dom 这个库的行为
  if (isReservedTag(vnodeConf$$1.tagName)) {
    modifyOrdinayAttrAsLibAttr(vnodeConf$$1);
  }
}

function dealSingleBindAttr ({attrName, value}, comp, vnodeConf$$1) {
  if (attrName === 'style') {
    if (!styleString.test(value)) {
      vnodeConf$$1.attrs.style = spliceStyleStr(vnodeConf$$1.attrs[attrName], value);
      return
    }

    vnodeConf$$1.attrs.style = spliceStyleStr(
      vnodeConf$$1.attrs[attrName],
      getFormatStyle(getValue())
    );
    return
  }

  // 其他所有的属性都直接添加到 vnodeConf 的 attrs 中
  vnodeConf$$1.attrs[attrName] = comp
    ? getValue()
    : value;

  // 计算模板表达式
  function getValue () {
    return runExecuteContext(`with($obj_) { return ${value}; }`, 'bind', vnodeConf$$1.tagName, comp)
  }
}

function getNormalStyleKey (key) {
  return key.replace(/[A-Z]/g, k1 => {
    return '-' + k1.toLocaleLowerCase()
  })
}

function getFormatStyle (v) {
  let result = '';
  for (const key of Object.keys(v)) {
    result += `${getNormalStyleKey(key)}: ${v[key]};`;
  }
  return result
}

function spliceStyleStr (o, n) {
  if (!o) return n
  if (o[o.length - 1] === ';')
    return o + n

  return o + ';' + n
}

// 匹配属性名
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;

// 匹配标签名(包括 - )
const ncname = '[a-zA-Z_][\\w\\-\\.]*';
const qnameCapture = `((?:${ncname}\\:)?${ncname})`;
const startTagOpen = new RegExp(`^<${qnameCapture}`);
const startTagClose = /^\s*(\/?)>/;
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`);

// 匹配文本节点
const textREG = /[^<]*/;
const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/;

// 匹配注释节点,doctype,ie hack节点
const doctype = /^<!DOCTYPE [^>]+>/i;
const comment = /^<!--/;
const conditionalComment = /^<!\[/;

const TEXT = 0; // 文本
const STATICTAG = 1; // 静态节点
const TAG = 2; // 元素节点

function parseTemplate (html, compName) {
  let index = 0;
  let searchEndCount = 0;
  let ast = [];
  let scope = ast;

  filter();
  while(html) {
    searchEndCount++;
    parseStart();
    parseEnd();

    // 一个结束标签最少有四个字符 </a>
    if (searchEndCount > html.length / 4) {
      warn(`Parsing template error\n\n   Missing end tag  \n\n  ---> ${compName}\n`);
    }
  }

  // 我们规定一个组件的模板只能有一个根节点
  return ast[0]

  function parseStart () {
    const match = html.match(startTagOpen);
    if (match && match[0]) {
      const tagStr = match[0];
      const tagName = match[1];
      const tagNode = createTag(
        tagName,
        scope === ast
          ? null
          : scope
      );

      if (scope !== ast) {
        scope.children.push(tagNode);
      } else {
        ast.push(tagNode);
      }
      // 作用域下降
      scope = tagNode;
      advance(tagStr.length);

      let end, attr, attrName, attrValue;

      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
        advance(attr[0].length);
        attrName = attr[1];
        attrValue = attr[3] || attr[4] || attr[5];

        if (/^v-|@|:+/.test(attrName)) {
          conversionDirection({ [attrName]: attrValue });
        } else {
          scope.attrs[attrName] = attrValue;
        }
      }

      if (end[1] ) {
        scope.isUnaryTag = true;
        scope.end = index;
        scope = scope.parent;
        searchEndCount = 0;
      } else {
        scope.isUnaryTag = false;
      }
      advance(end[0].length);

      while (parseStaticTag()) {}
    }
  }

  function parseStaticTag () {
    filter();
    const match = html.match(textREG);
    let text;
    if (!match || !match[0])
    return false

    if (match && (text = match[0])) {
      // 纯静态文本
      if (!defaultTagRE.test(text)) {
        const textNode = createStaticNode(text, scope);
        advance(text.length);
        textNode.end = index;

        if (scope === null) {
          warn(`Component can only have one root node \n\n  --->  ${compName}\n`);
        }
        scope.children.push(textNode);
      } else {
        const expression = parseTextExpression(text);
        const staticTag = createStaticTag(text, expression, scope);
        advance(text.length);
        staticTag.end = index;
        scope.children.push(staticTag);
      }
    }
    return true
  }

  function parseTextExpression (text) {
    let l = 0;
    let first = true;
    let match = null;
    let resultText = '';
    const reg = new RegExp(defaultTagRE, 'g');

    while (match = reg.exec(text)) {
      resultText += first
      ? `\`${text.slice(l, match.index)}\` + _s(${match[1]}) `
      : `+ \`${text.slice(l, match.index)}\` + _s(${match[1]}) `;

      l = match.index + match[0].length;
      first && (first = false);
    }

    if (l === text.length)
      return resultText

    resultText += `+ \`${text.slice(l, text.length)}\``;
    return resultText
  }

  function parseEnd () {
    const match = html.match(endTag);

    if (match && match[0]) {
      const [tagStr, tagName] = match;
      if (scope.type === TAG && scope.tagName === tagName) {
        // 找到结束标签，清空
        searchEndCount = 0;

        advance(tagStr.length);
        scope.end = index;
        scope = scope.parent;
        // 当前标签结束后回到父级标签，继续解析静态内容，直到全部解析完毕
        while (parseStaticTag()) {}
      }
    }
  }

  function filter () {
    // 过滤注释
    if (comment.test(html)) {
      const commentEnd = html.indexOf('-->');
      if (commentEnd >= 0) {
        advance(commentEnd + 3);
      }
    }

    // 过滤<![和]>注释的内容
    if (conditionalComment.test(html)) {
      const conditionalEnd = html.indexOf(']>');

      if (conditionalEnd >= 0) {
        advance(conditionalEnd + 2);
      }
    }

    // 过滤doctype
    const doctypeMatch = html.match(doctype);
    if (doctypeMatch) {
      advance(doctypeMatch[0].length);
    }
  }

  function advance (n) {
    index += n;
    html = html.substring(n);
  }

  function getForArgs (attr) {
    const args = /((\w+)|(\([^\(]+\)))\s+of\s+([\w\.\(\)\[\]]+)/g.exec(attr['v-for']);
    if (args) {
      let key = args[1];
      if (key.includes(',')) {
        key = key
          .replace(/[\(\)]/g, '')
          .split(',')
          .map(val => val.trim());
      }

      return {
        key,
        data: args[4],
        isMultiple: Array.isArray(key),
      }
    }

    return null
  }

  function conversionDirection (vAttr) {
    let bind, on;
    let key = Object.keys(vAttr)[0];

    if (key === 'v-for' && vAttr[key]) {
      const args = getForArgs(vAttr);

      scope.forMultipleArg = Array.isArray(args);
      scope.forArgs = args;
      scope.for = true;
    }

    if (key === 'v-if') {
      scope.if = true;
    }
    if ((bind = key.match(/^(:)(.+)/))) {
      vAttr = {['v-bind' + key]: vAttr[key]};
    }
    if ((on = key.match(/^@(.+)/))) {
      vAttr = {['v-on:' + on[1]]: vAttr[key]};
    }

    scope.direction.push(vAttr);
  }

  function createTag (tagName, parent) {
    const root = parent ? false : true;
    return {
      type: TAG,
      tagName,
      bindState: [],
      children: [],
      attrs: {},
      start: index,
      end: null,
      parent,
      root,
      isUnaryTag:null,
      direction: [],
      hasBindings () {
        return !!this.direction.length
      }
    }
  }

  function createStaticTag (content, expression, parent) {
    return {
      type: STATICTAG,
      start: index,
      bindState: [],
      parent,
      end: null,
      expression,
      content,
    }
  }

  function createStaticNode (content, parent) {
    return {
      type: TEXT,
      start: index,
      parent,
      end: null,
      content,
      static: true,
    }
  }
}

function makeMap (str, expectsLowerCase) {
  const map = Object.create(null);
  const list = str.split(',');
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true;
  }
  return expectsLowerCase
    ? val => map[val.toLowerCase()]
    : val => map[val]
}

function sendDirectWarn (direct, compName) {
  warn(`Cannot make "${direct}" directives on the root node of a component，
  Maybe you can specify the "${direct}" command on "<${compName} ${direct}="xxx" />"
    \n\n  ---> ${compName}\n`);
}

// 只允许对象、数组或者类数组进行深拷贝
// 我们只对循环引用的对象进行一层的检查，应该避免使用深层循环引用的对象
// 更好的工具函数可以用 lodash
function deepClone (obj, similarArr) {
  let res;
  if (isPlainObject(obj)) {
    res = new obj.constructor;
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      let val = obj[keys[i]];
      // 避免循环引用
      if (val === obj) continue
      res[keys[i]] = canUse(val) ? val : deepClone(val, similarArr);
    }
    return res
  }

  if (Array.isArray(obj) || similarArr) {
    res = new obj.constructor;
    for (let i = 0; i < obj.length; i++) {
      let val = obj[i];
      if (val === obj) continue
      res[i] = canUse(val) ? val : deepClone(val, similarArr);
    }
    return res
  }

  function canUse (val) {
    return (
      isPrimitive(val) ||
      val == null ||
      typeof val === 'function'
    )
  }

  return obj
}

function vnodeConf (astNode, parent) {
  if (astNode.type === TAG) {
    const { tagName, attrs, direction } = astNode;
    const _attrs = deepClone(attrs);
    const _direction = deepClone(direction);
    const _children = [];

    return vTag(tagName, _attrs, _direction, _children, parent)
  }

  return vText(astNode.content, parent)
}

function vTag (tagName, attrs, direction, children, parent) {
  const node = Object.create(null);

  node.type = TAG;
  node.attrs = attrs;
  node.parent = parent;
  node.tagName = tagName;
  node.children = children;
  node.direction = direction;

  return node
}

function vText (content, parent) {
  const node = Object.create(null);

  node.type = TEXT;
  node.parent = parent;
  node.content = content;

  return node
}

function removeChild (parent, child, notOnly) {
  const children = parent.children;
  for (let i = 0; i < children.length; i++) {
    if (children[i] === child) {
      children.splice(i, 1);
      if (notOnly) i--;
      else break
    }
  }
}

const filterAttr = {
  'namespace': 1,
  'className': 1,
  'styleName': 1,
  'style': 1,
  'class': 1,
  'key': 1,
  'id': 1,
};

function isFilter (key) {
  return filterAttr[key] || key.slice(0, 2) === 'on'
}

function modifyOrdinayAttrAsLibAttr (node) {
  if (!node.attrs) return
  const keyWord = 'attributes';
  const attrs = node.attrs;
  const originAttr = attrs[keyWord];
  const keys = Object.keys(attrs);

  attrs[keyWord] = Object.create(null);

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    if (isFilter(key)) continue
    attrs[keyWord][key] = attrs[key];

    if (key !== keyWord) {
      attrs[key] = undefined;
    }
  }

  if (originAttr) {
    attrs[keyWord][keyWord] = originAttr;
  }
}

function migrateCompStatus (outputNode, acceptNode) {
  if (!outputNode || !acceptNode) return
  // 我们需要迁移的数据 vTextResult、vShowResult
  if (hasOwn(outputNode, 'vTextResult')) {
    const res = outputNode['vTextResult'];
    acceptNode.children.unshift(
      vText(toString(res), acceptNode)
    );
  }

  if (hasOwn(outputNode, 'vShowResult')) {
    const res = outputNode['vShowResult'];
    bind(res, null, acceptNode);
  }
}

const filterPropsList = {
  'key': 1,
};

function setProps (attrs, requireList, compName) {
  // 如果定义了需要的 props 列表，我们就按照列表得到来
  // 而且我们需要过滤掉内部用到的属性，例如 "key"
  const props = Object.create(null);
  if (!attrs) return props
  const keys = Object.keys(attrs);
  let index = null;

  for (let i = 0; i < keys.length; i++) {
    if (filterPropsList[keys[i]]) continue
    const key = keys[i];
    const val = attrs[key];

    if (!requireList) {
      props[key] = val;
    } else if (requireList && ~(index = requireList.indexOf(key))) {
      props[key] = val;
      requireList.splice(index, 1);
    }
  }

  if (requireList && requireList.length) {
    for (let j = 0; j < requireList.length; j++) {
      warn(
        `Parent component does not pass "${requireList[j]}" attribute  \n\n    --->  ${compName}\n`,
        true,
      );
    }
  }

  return props
}

// 判断一个 function 应该是以怎样的行为进行调用
// 箭头函数 与 async 没有 prototype
// class 语法在原型上添加的属性不可被遍历
// constructor 属性不可被遍历
function isClass (fun) {
  const proto = fun.prototype;
  if (!proto || isGeneratorFunction(fun)) {
    return false
  }

  if (isEmptyObj(proto)) {
    const constructor = proto.constructor;
    if (constructor && constructor === fun) {
      const descriptors = Object.getOwnPropertyDescriptors(proto);
      return Object.keys(descriptors).length > 1
        ? true
        : false
    }

    // 如果没有 constructor，或者 constructor 被修改过
    // 我们认为这个 function 是有可能会被当成 class 来使用
    return true
  }
  return true
}

const isHTMLTag = makeMap(
  'html,body,base,head,link,meta,style,title,' +
  'address,article,aside,footer,header,h1,h2,h3,h4,h5,h6,hgroup,nav,section,' +
  'div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,' +
  'a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby,' +
  's,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,' +
  'embed,object,param,source,canvas,script,noscript,del,ins,' +
  'caption,col,colgroup,table,thead,tbody,td,th,tr,' +
  'button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,' +
  'output,progress,select,textarea,' +
  'details,dialog,menu,menuitem,summary,' +
  'content,element,shadow,template,blockquote,iframe,tfoot'
);

// 只包含可能的SVG元素
const isSVG = makeMap(
  'svg,animate,circle,clippath,cursor,defs,desc,ellipse,filter,font-face,' +
  'foreignObject,g,glyph,image,line,marker,mask,missing-glyph,path,pattern,' +
  'polygon,polyline,rect,switch,symbol,text,textpath,tspan,use,view',
  true
);

function isReservedTag (tag) {
  return isHTMLTag(tag) || isSVG(tag)
}

class Container {
  constructor (val) {
    this._value = val;
  }

  pipe (fun) {
    return Container.of(fun(this._value))
  }

  safePipe (fun) {
    return isUndef(this._value)
      ? Container.of(null)
      : Container.of(fun(this._value))
  }

  maybe (fun) {
    return fun
      ? fun(this._value)
      : this._value
  }

  static
  of (val) {
    return new Container(val)
  }
}

const directContainer = Object.create(null);

function customDirective (direct, callback) {
  directContainer['v-' + direct] = Container.of(callback);
  return this
}

function haveRegisteredCustomDirect (key) {
  return hasOwn(directContainer, key)
}

function elementCreated (comp, dom, direaction) {
  if (!direaction || isEmptyObj(direaction)) return
  const keys = Object.keys(direaction);

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    const val = directContainer[key];
    val.safePipe(callback => {
      callback(comp, dom, direaction[key]);
    });
  }
}

function createElement (comp, vnode, opts) {
  const doc = opts ? opts.document || document : document;

  vnode = handleThunk(vnode).a;

  if (isWidget(vnode)) {
    const node = vnode.init();
    elementCreated(comp, node, vnode.customDirection);
    return node
  } else if (isVText(vnode)) {
    return doc.createTextNode(vnode.text)
  } else if (!isVNode(vnode)) {
    warn('Item is not a valid virtual dom node');
    return null
  }

  const node = (vnode.namespace === null) ?
    doc.createElement(vnode.tagName) :
    doc.createElementNS(vnode.namespace, vnode.tagName);

  const props = vnode.properties;
  applyProperties(node, props);

  const children = vnode.children;

  for (let i = 0; i < children.length; i++) {
    const childNode = createElement(comp, children[i], opts);
    if (childNode) {
      node.appendChild(childNode);
    }
  }

  if (vnode.renderCompleted) {
    vnode.renderCompleted(node);
  }

  elementCreated(comp, node, vnode.customDirection);
  return node
}

function _h (tagName, attrs, customDirection, children) {
  const vnode = virtualDom.h(tagName, attrs, children);
  // customDirection 设置为只读属性，避免被 vritual-dom 这个库给修改了
  setOnlyReadAttr(vnode, 'customDirection', customDirection || null);
  return vnode
}

// 创建一个组件实例，分为状态组件和无状态组件
function createCompInstance (comConstructor, parentConf, parentComp) {
  const isClass$$1 = isClass(comConstructor);
  let comp;

  if (isClass$$1) {
    comp = new comConstructor(parentConf.attrs);
  } else {
    // 创建无状态组件
    const props = setProps(parentConf.attrs);
    const template = comConstructor(props);
    comp = {
      constructor: comConstructor,
      name: comConstructor.name,
      noStateComp: !isClass$$1,
      template,
      props,
    };
  }

  // 避免组件自己引用自己
  if (isClass$$1 && comp.prototype === Object.getPrototypeOf(parentComp)) {
    warn(`Component can not refer to themselves  \n\n  --->  ${parentComp.name}\n`);
    return
  }

  // 我们把 ast 缓存到类的构造函数上
  if (!comConstructor.$ast) {
    const { template, name } = comp;
    comConstructor.$ast = createAst(template, name);
  }

  return comp
}

function createAst (template, compName) {
  let ast;
  if (typeof template === 'function') {
    template = template();
  }

  if (!isString(template)) {
    warn(`Component template must a "string" or "function", But now is "${typeof template}"
      \n\n  --->  ${compName}\n`);
    return
  }
  if (!(ast = parseTemplate(template.trim(), compName))) {
    warn(`No string template available  \n\n  --->  ${compName}`);
    return
  }

  return ast
}

// 我们要保证 for 循环得到的变量在其他指令中都能用上
// v-if 第二个执行，因为 if 可能为 false，我们尽量避免不必要的指令执行
const TEXT$1 = 0;
const SHOW = 1;
const ON = 2;
const BIND = 3;
const IF = 4;
const FOR = 5;

const directWeight = {
  'v-show': SHOW,
  'v-for': FOR,
  'v-on': ON,
  'v-text': TEXT$1,
  'v-bind': BIND,
  'v-if': IF
};

const DIRECTLENGTH = Object.keys(directWeight).length;

function getWeight (direct) {
  let wight = directWeight[direct];
  if (direct.includes('v-bind')) wight = BIND;
  if (direct.includes('v-on')) wight = ON;

  return wight
}

function isReservedDirect (direct) {
  return direct.includes('v-') && (getWeight(direct) !== undefined)
}

function vevent (events, comp, vnodeConf$$1) {
  if (isReservedTag(vnodeConf$$1.tagName)) {
    for (const event of events) {
      const name = event.attrName;
      const code = `
        with ($obj_) {
          return ${event.value};
        }
      `;

      vnodeConf$$1.attrs['on' + name] = runExecuteContext(code, 'on', vnodeConf$$1.tagName, comp);
    }
  }
}

function vfor (node, comp, vnodeConf$$1) {
  if (!node.for || !node.forArgs) return
  if (!node.parent) {
    sendDirectWarn('v-for', comp.name);
    return
  }

  const cloneNodes = [];
  const { data, key, isMultiple } = node.forArgs;

  const code = `
    with($obj_) {
      for (var $index_ = 0; $index_ < ${data}.length; $index_++) {
        if (${isMultiple}) {
          $scope_.add('${key[0]}', ${data}[$index_]);
          $scope_.add('${key[1]}', $index_);
        } else {
          $scope_.add('${key}', ${data}[$index_]);
        }

        $callback_($index_);
      }
    }
  `;
  function vforCallback (i) {
    const cloneNode = vnodeConf(node, vnodeConf$$1.parent);
    cloneNode.attrs['key'] = i;

    // 我们要避免无限递归的进入 for 指令
    node.for = false;

    cloneNodes[i] = parseSingleNode(node, comp, cloneNode) === false
        ? null
        : cloneNode;
  }

  scope$1.create();
  runExecuteContext(code, 'for', vnodeConf$$1.tagName, comp, vforCallback);
  scope$1.destroy();

  const index = serachIndex(vnodeConf$$1);
  replaceWithLoopRes(vnodeConf$$1, cloneNodes, index);
  node.for = true;
}

function serachIndex (node) {
  const children = node.parent.children;
  const length = children.length;
  for (let i = 0; i < length; i++) {
    if (children[i] === node)
      return i
  }
}

function replaceWithLoopRes (node, res, i) {
  const children = node.parent.children;
  children.splice(i, 1, ...res);
}

function vif (node, val, comp, vnodeConf$$1) {
  if (!node.parent) {
    return sendDirectWarn('v-if', comp.name)
  }

  const res = runExecuteContext(`
    with($obj_) {
      return !!(${val});
    }
  `, 'if', vnodeConf$$1.tagName, comp);

  if (!res) {
    removeChild(vnodeConf$$1.parent, vnodeConf$$1);
  }

  return res
}

function show (val, comp, vnodeConf$$1) {
  const code = `with($obj_) { return !!(${val}); }`;

  const value = runExecuteContext(code, 'show', vnodeConf$$1.tagName, comp)
    ? ''
    : 'display: none';

  const bindValue = { attrName: 'style', value };

  if (isReservedTag(vnodeConf$$1.tagName)) {
    bind(bindValue, comp, vnodeConf$$1);
    return
  }

  vnodeConf$$1.vShowResult = bindValue;
}

function text (val, comp, vnodeConf$$1) {
  const code = `with($obj_) { return ${val}; }`;
  const content = runExecuteContext(code, 'text', vnodeConf$$1.tagName, comp);

  if (isReservedTag(vnodeConf$$1.tagName)) {
    // 但是既然用了 v-text 就不应该继续添加子元素了
    // 从语义上讲，我们认为这个标签是一个 text 标签
    // 但是为了保证代码的逻辑，我们还是需要做下处理
    // 此时的 children 还只是个 []， 所以我们把 text 放在第一个
    vnodeConf$$1.children = [vText(content, vnodeConf$$1)];
  } else {
    vnodeConf$$1.vTextResult = content;
  }
}

function runCustomDirect (key, tagName, val, comp) {
  return runExecuteContext(`
    with ($obj_) {
      return ${val};
    }`,
    key.slice(2, key.length),
    tagName,
    comp
  )
}

/**
 *  vnodeConf 作为一个创建 vnodeTree 的配置项
 *  避免每次 diff 创建 vnode 都需要对整个 ast 进行复制编译
 *  因为现在没有办法做到针对单个指令进行编译
 *  所以我们只能尽量降低每次编译指令时的开销
 */

function complierAst (ast, comp) {
  if (!comp.noStateComp) {
    const state = comp.state;
    if (isFunction(state)) {
      const res = state();
      isPlainObject(res)
        ? comp.state = res
        : warn(`Component "state" must be a "Object"  \n\n  ---> ${comp.name}\n`);
    }
  }

  const vnodeConf$$1 = vnodeConf(ast);
  vnodeConf$$1.props = Object.create(null);

  parseSingleNode(ast, comp, vnodeConf$$1);

  // 每个组件编译完成，都要 reset 作用域
  scope$1.resetScope();
  return vnodeConf$$1
}

function complierChildrenNode (node, comp, vnodeConf$$1) {
  const children = node.children;
  if (!children || !children.length) return

  for (let i = 0; i < children.length; i++) {
    const childVnodeConf = vnodeConf(children[i], vnodeConf$$1);
    vnodeConf$$1.children.push(childVnodeConf);
    parseSingleNode(children[i], comp, childVnodeConf);
  }
}

function parseSingleNode (node, comp, vnodeConf$$1) {
  switch (node.type) {
    case TAG :
      if (parseTagNode(node, comp, vnodeConf$$1) === false)
        return false
      break
    case STATICTAG :
      parseStaticNode(node, comp, vnodeConf$$1);
      break
  }

  if (!node.for) {
    complierChildrenNode(node, comp, vnodeConf$$1);
  }
}

function parseTagNode (node, comp, vnodeConf$$1) {
  // 处理有指令的情况，我们会在每个指令的执行过程中进行递归调用，编译其 children
  if (node.hasBindings()) {
    return complierDirect(node, comp, vnodeConf$$1)
  }
}

function complierDirect (node, comp, vnodeConf$$1) {
  const directs = node.direction;
  const nomalDirects = [];
  const customDirects = {};
  let currentWeight = null; // 当前保留指令
  let currentCustomDirect = null;  // 当前自定义指令

  for (let i = 0; i < directs.length; i++) {
    const direct = directs[i];
    const key = Object.keys(direct)[0];

    // 添加自定义指令集合
    if (!isReservedDirect(key)) {
      if (!haveRegisteredCustomDirect(key) || key === currentCustomDirect) {
        continue
      }
      currentCustomDirect = key;
      customDirects[key] = function delay () {
        customDirects[key] = runCustomDirect(key, vnodeConf$$1.tagName, direct[key], comp, vnodeConf$$1);
      };
      continue
    }

    const weight = getWeight(key);
    if (isSameDirect(weight)) continue

    currentWeight = weight;

    if (isMultipleDirect(weight)) {
      addMultipleDirect(direct, weight, key);
      continue
    }

    nomalDirects[weight] = direct[key];
  }

  // 指定自定义指令
  vnodeConf$$1.customDirection = customDirects;

  // 按照指令的权重进行指令的编译
  // 我们只在 for 指令第一次进入的时候只执行 for 指令，后续复制的 vnodeconf 都需要全部执行
  for (let w = DIRECTLENGTH - 1; w > -1; w--) {
    if (!nomalDirects[w]) continue
    const directValue = nomalDirects[w];
    const execResult = executSingleDirect(w, directValue, node, comp, vnodeConf$$1);

    if (node.for) return
    if (execResult === false) return false
  }

  // 在所有保留指令执行过后再执行自定义指令
  each(customDirects, val => val());

  function addMultipleDirect (direct, weight, key) {
    const detail = {
      attrName: key.split(':')[1].trim(),
      value: direct[key],
    };

    !nomalDirects[weight]
      ? nomalDirects[weight] = [detail]
      : nomalDirects[weight].push(detail);
  }

  // 清除重复的指令，但是需要排除 event 和 bind 指令
  function isSameDirect (weight) {
    return (
      weight !== BIND &&
      weight !== ON &&
      weight === currentWeight
    )
  }

  function isMultipleDirect (weight) {
    return weight === BIND || weight === ON
  }
}

function parseStaticNode (node, comp, vnodeConf$$1) {
  const code = `
    with ($obj_) {
      function _s (_val_) { return _val_ };
      return ${node.expression};
    }
  `;
  vnodeConf$$1.content = runExecuteContext(code, '{{ }}', vnodeConf$$1.parent.tagName, comp);
}

function executSingleDirect (weight, val, node, comp, vnodeConf$$1) {
  switch (weight) {
    case SHOW :
      show(val, comp, vnodeConf$$1);
      break
    case FOR :
      vfor(node, comp, vnodeConf$$1);
      break
    case ON :
      vevent(val, comp, vnodeConf$$1);
      break
    case TEXT$1 :
      text(val, comp, vnodeConf$$1);
      break
    case BIND :
      bind(val, comp, vnodeConf$$1);
      break
    case IF :
      return vif(node, val, comp, vnodeConf$$1)
    default :
      customDirect(val, comp, vnodeConf$$1);
  }
}

function createVnode (parentConf, ast, comp) {
  const vnodeConf$$1 = complierAst(ast, comp);

  migrateCompStatus(parentConf, vnodeConf$$1);

  return _h(vnodeConf$$1.tagName, vnodeConf$$1.attrs,
    vnodeConf$$1.customDirection, generatorChildren(vnodeConf$$1.children, comp))
}

function generatorChildren (children, comp) {
  const vnodeTree = [];

  for (let i = 0; i < children.length; i++) {
    if (!children[i]) continue
    const conf = children[i];
    if (conf.type === TAG) {
      if (!isReservedTag(conf.tagName)) {
        // 自定义组件
        vnodeTree.push(createCustomComp(conf, comp));
        continue
      }

      // 递归创建 vnode
      const _children = generatorChildren(conf.children, comp);
      vnodeTree.push(_h(conf.tagName, conf.attrs, conf.customDirection, _children));
      continue
    }

    // 文本节点直接添加文件就好了，过滤掉换行空格
    const content = toString(conf.content);
    if (content.trim()) {
      vnodeTree.push(content);
    }
  }

  return vnodeTree
}

function createCustomComp (parentConf, comp) {
  const childComp = getChildComp(comp, parentConf.tagName);
  if (typeof childComp !== 'function') {
    warn(`Component [${conf.tagName}] is not registered  \n\n  --->  ${comp.name}\n`);
    return
  }

  const childCompInstance = createCompInstance(childComp, parentConf, comp);
  return createCompVnode(parentConf, childCompInstance)
}

// 拿到子组件
function getChildComp (parentComp, tagName) {
  if (!parentComp.component) return null

  let childComps = parentComp.component;

  if (typeof childComps === 'function') {
    childComps = childComps();
  }
  if (isPlainObject(childComps)) {
    return childComps[tagName]
  }

  if (Array.isArray(childComps)) {
    for (let i = 0; i < childComps.length; i++) {
      if (tagName === childComps[i].name) {
        return childComps[i]
      }
    }
  }

  return null
}

function createCompVnode (parentConf, comp) {
  function ComponentElement () {}

  ComponentElement.prototype.type = 'Widget';

  // 我们构建的这个组件节点现在并没有一个子元素，否则会在 patch 的时候计算错误
  ComponentElement.prototype.count = 0;
  ComponentElement.prototype.init = function() {
    return createRealDom(parentConf, comp)
  };

  ComponentElement.prototype.update = function(previous, domNode) {
    console.log('component update', previous, domNode);
  };

  ComponentElement.prototype.destroy = function(dom) {
    if (!comp.noStateComp) {
      comp.destroy(dom);
    }
  };

  const vnode = new ComponentElement;

  setOnlyReadAttr(vnode, 'customDirection',
    parentConf.customDirection || null);

  return vnode
}

function createRealDom (parentConf, comp) {
  const ast = comp.constructor.$ast;

  if (comp.noStateComp) {
    const vTree = createVnode(parentConf, ast, comp);
    const dom = createElement(comp, vTree);
    return dom
  }

  comp.createBefore();
  const vTree = createVnode(parentConf, ast, comp);
  const dom = createElement(comp, vTree);

  comp.$cacheState.dom = dom;
  comp.$cacheState.vTree = vTree;

  comp.create(dom);

  return dom
}

// 我们对 setState 进行批量更新

const capacity = 1024;

function enqueueSetState (comp, partialState) {
  if (!comp.$cacheState.stateQueue.length) {
    updateQueue(comp);
  }
  comp.$cacheState.stateQueue.push(partialState);
}

// TODO 这个地方需要用事务做一手防递归，后续处理
function updateQueue (comp) {
  Promise.resolve().then(() => {
    const queue = comp.$cacheState.stateQueue;
    let state = Object.assign({}, comp.state);
    let index = 0;

    while (index < queue.length) {
      const currentIndex = index;
      index++;
      state = mergeState(state, queue[currentIndex]);

      if (index > capacity) {
        const newLength = queue.length - index;
        for (let i = 0; i < newLength; i++) {
          queue[i] = queue[index + i];
        }
        queue.length -= index;
        index = 0;
      }
    }

    queue.length = 0;
    comp.state = state;
    updateDomTree(comp);
  });
}

function mergeState (state, partialState) {
  if (typeof partialState === 'function') {
    const newState = partialState(state);
    return isPlainObject(newState)
      ? newState
      : state
  }
  return Object.assign({}, state, partialState)
}

function updateDomTree (comp) {
  if (comp.willUpdate(comp.state, comp.props) === false) {
    return
  }
  const ast = comp.constructor.$ast;
  const dom = comp.$cacheState.dom;
  const oldTree = comp.$cacheState.vTree;
  const newTree = createVnode(null, ast, comp);
  const patchs = virtualDom.diff(oldTree, newTree);

  virtualDom.patch(dom, patchs);

  comp.didUpdate(dom);
  comp.$cacheState.vTree = newTree;
}

class Component {
  constructor (attrs, requireList) {
    this.state = Object.create(null);
    this.props = setProps(attrs, requireList, this.name);
    this.$cacheState  = {
      stateQueue: [],
    };
  }

  createBefore () {}
  create () {}
  willUpdate () {}
  didUpdate () {}
  destroy () {}

  setState (partialState) {
    enqueueSetState(this, partialState);
  }

  createState (data) {
    if (isPlainObject(data)) {
      this.state = Object.setPrototypeOf(data, null);
    }
  }

  get name () {
    return this.constructor.name
  }
}

function mount (rootDOM, compClass) {
  return new Promise((resolve) => {
    const comp = createCompInstance(compClass, {}, {});
    const dom = createRealDom(null, comp);

    rootDOM.appendChild(dom);
    resolve(dom);
  })
}

class BaseObserver {
  constructor () {
    this.commonFuns = [];
    this.onceFuns = [];
  }

  on (fun) {
    if (typeof fun === 'function') {
      const l = this.commonFuns.length;
      this.commonFuns[l] = fun;
    }
  }

  once (fun) {
    if (typeof fun === 'function') {
      const l = this.onceFuns.length;
      this.onceFuns[l] = fun;
    }
  }

  emit (data) {
    const { commonFuns, onceFuns } = this;

    if (commonFuns.length) {
      for (let i = 0; i < commonFuns.length; i++) {
        commonFuns[i](data);
      }
    }

    if (onceFuns.length) {
      for (let j = 0; j < onceFuns.length; j++) {
        onceFuns[j](data);
        onceFuns.splice(j, 1);
        j--;
      }
    }
  }

  remove (fun) {
    if (!fun || typeof fun !== 'function') {
      this.commonFuns = [];
      this.onceFuns = [];
    }

    removeFun(this.commonFuns, fun);
    removeFun(this.onceFuns, fun);
  }
}

function removeFun (arr, fun){
  let index;
  let breakIndex = 0;
  while (~(index = arr.indexOf(fun, breakIndex))) {
    arr.splice(index, 1);
    breakIndex = index;
  }
}

function extendEvent (compClass) {
  if (!isClass(compClass)) {
    warn(`Cannot create observers for stateless components\n\n  ---> ${compClass.name}\n`);
    return
  }
  if (!compClass || hasExpanded(compClass)) {
    return compClass
  }

  let isDone = false;
  let nextOB = new BaseObserver;
  let doneOB = new BaseObserver;
  let errorOB = new BaseObserver;

  compClass.on = function on (callback) {
    if (typeof callback === 'function') {
      nextOB.on(callback);
    }
    return compClass
  };

  compClass.once = function once (callback) {
    if (typeof callback === 'function') {
      nextOB.once(callback);
    }
    return compClass
  };

  compClass.done = function done (callback) {
    if (typeof callback === 'function') {
      doneOB.on(callback);
    }
    return compClass
  };

  compClass.error = function error (callback) {
    if (typeof callback === 'function') {
      errorOB.on(callback);
    }
    return compClass
  };


  compClass.prototype.next = function _next (val) {
    if (!isDone) {
      nextOB.emit(val);
    }
    return this
  };

  compClass.prototype.done = function _done (val) {
    if (!isDone) {
      doneOB.emit(val);
      isDone = true;
      remove$$1();
    }
  };

  compClass.prototype.error = function _error (reason) {
    if (!isDone) {
      errorOB.emit(creataError(reason));
      isDone = true;
      remove$$1();
    }
  };

  compClass.remove = compClass.prototype.remove = remove$$1;

  function remove$$1 (fun) {
    nextOB.remove(fun);
    doneOB.remove(fun);
    errorOB.remove(fun);
  }


  return compClass
}

function hasExpanded (compClass) {
  if (!compClass.$destroy) return false
  return compClass.$destroy === compClass.prototype.$destroy
}

function creataError (reason) {
  try {
    throw Error(reason)
  } catch (err) {
    return err
  }
}

function initGlobalAPI (Grass) {
  Grass.directive = customDirective;
  Grass.event = extendEvent;
}

const Grass = {
  Component,
  mount,
};

const prototype = {};

initGlobalAPI(prototype);
Object.setPrototypeOf(Grass, prototype);

module.exports = Grass;