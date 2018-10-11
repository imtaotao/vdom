import * as W from './weight'
import * as _ from '../utils/index'
import bind from './bind'
import vevent from './event'
import vfor from './for'
import vif from './if'
import show from './show'
import text from './text'
import scope from './scope'
import transition from './transition'
import runCustomDirect from './custom-direct'
import runExecuteContext from './execution-env'
import { TAG, STATICTAG } from '../ast/parse-template'
import { haveRegisteredCustomDirect } from '../global-api/constom-directive'
import { createVnodeConf } from './util'

/**
 *  vnodeConf 作为一个创建 vnodeTree 的配置项
 *  避免每次 diff 创建 vnode 都需要对整个 ast 进行复制编译
 *  因为现在没有办法做到针对单个指令进行编译
 *  所以我们只能尽量降低每次编译指令时的开销
 */

export default function complierDirectFromAst (ast, component) {
  const vnodeConf = createVnodeConf(ast)
  vnodeConf.props = Object.create(null)

  parseSingleNode(ast, component, vnodeConf)

  // 每个组件编译完成，都要 reset 作用域
  scope.resetScope()
  return vnodeConf
}

export function complierChildrenNode (node, component, vnodeConf) {
  const children = node.children
  if (!children || !children.length) return

  for (let i = 0; i < children.length; i++) {
    const childVnodeConf = createVnodeConf(children[i], vnodeConf)
    vnodeConf.children.push(childVnodeConf)
    parseSingleNode(children[i], component, childVnodeConf)
  }
}

export function parseSingleNode (node, component, vnodeConf) {
  switch (node.type) {
    case TAG :
      if (parseTagNode(node, component, vnodeConf) === false) {
        return false
      }
      break
    case STATICTAG :
      parseStaticNode(node, component, vnodeConf)
      break
  }

  if (!node.for) {
    if (vnodeConf.type === TAG && _.isReservedTag(vnodeConf.tagName)) {
      modifyOrdinayAttrAsLibAttr(vnodeConf)
    }

    complierChildrenNode(node, component, vnodeConf)
  }
}

function parseTagNode (node, component, vnodeConf) {
  // 处理有指令的情况，我们会在每个指令的执行过程中进行递归调用，编译其 children
  if (node.hasBindings()) {
    return complierDirect(node, component, vnodeConf)
  }
}

function complierDirect (node, component, vnodeConf) {
  const directs = node.direction
  const nomalDirects = []
  const customDirects = {}
  const transtionHookFuns = {}
  let currentWeight = null // 当前保留指令
  let currentCustomDirect = null  // 当前自定义指令

  for (let i = 0; i < directs.length; i++) {
    const direct = directs[i]
    const key = Object.keys(direct)[0]

    // 收集动画钩子函数
    if (W.isTransitionHook(key)) {
      transtionHookFuns[key] = direct[key]
      continue
    }

    // 添加自定义指令集合
    if (!W.isReservedDirect(key)) {
      if (!haveRegisteredCustomDirect(key) || key === currentCustomDirect) {
        continue
      }
      currentCustomDirect = key
      customDirects[key] = function delay () {
        customDirects[key] = runCustomDirect(key, vnodeConf.tagName, direct[key], component, vnodeConf)
      }
      continue
    }

    const weight = W.getWeight(key)
    if (isSameDirect(weight)) continue

    currentWeight = weight

    if (isMultipleDirect(weight)) {
      addMultipleDirect(direct, weight, key)
      continue
    }

    nomalDirects[weight] = direct[key]
  }


  // 指定自定义指令
  vnodeConf.customDirection = customDirects

  // 按照指令的权重进行指令的编译
  // 我们只在 for 指令第一次进入的时候只执行 for 指令，后续复制的 vnodeconf 都需要全部执行
  for (let w = W.DIRECTLENGTH - 1; w > -1; w--) {
    if (!nomalDirects[w]) continue
    const directValue = nomalDirects[w]
    const execResult = executSingleDirect(w, directValue, node, component, vnodeConf, transtionHookFuns)

    if (node.for) return
    if (execResult === false) {
      return false
    }
  }

  // 在所有保留指令执行过后再执行自定义指令
  _.each(customDirects, val => val())

  function addMultipleDirect (direct, weight, key) {
    const detail = {
      attrName: key.split(':')[1].trim(),
      value: direct[key],
    }

    !nomalDirects[weight]
      ? nomalDirects[weight] = [detail]
      : nomalDirects[weight].push(detail)
  }

  // 清除重复的指令，但是需要排除 event 和 bind 指令
  function isSameDirect (weight) {
    return (
      weight !== W.BIND &&
      weight !== W.ON &&
      weight === currentWeight
    )
  }

  function isMultipleDirect (weight) {
    return weight === W.BIND || weight === W.ON
  }
}

function parseStaticNode (node, component, vnodeConf) {
  const code = `
    with ($obj_) {
      function _s (_val_) { return _val_ };
      return ${node.expression};
    }
  `
  vnodeConf.content = runExecuteContext(code, '{{ }}', vnodeConf.parent.tagName, component)
}

function executSingleDirect (weight, val, node, component, vnodeConf, transtionHookFuns) {
  switch (weight) {
    case W.SHOW :
      show(val, component, vnodeConf)
      break
    case W.FOR :
      vfor(node, component, vnodeConf)
      break
    case W.ON :
      vevent(val, component, vnodeConf)
      break
    case W.TEXT :
      text(val, component, vnodeConf)
      break
    case W.BIND :
      bind(val, component, vnodeConf)
      break
    case W.IF :
      return vif(node, val, component, vnodeConf)
    case W.TRANSITION :
      return transition(val, component, vnodeConf, transtionHookFuns, true)
    case W.ANIMATION :
      return transition(val, component, vnodeConf, transtionHookFuns, false)
    default :
      customDirect(val, component, vnodeConf)
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
}

const isFilter = key => {
  return filterAttr[key] || key.slice(0, 2) === 'on'
}

function modifyOrdinayAttrAsLibAttr (node) {
  if (!node.attrs) return
  const keyWord = 'attributes'
  const attrs = node.attrs
  const originAttr = attrs[keyWord]
  const keys = Object.keys(attrs)

  attrs[keyWord] = Object.create(null)

  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]
    if (isFilter(key)) continue
    attrs[keyWord][key] = attrs[key]

    if (key !== keyWord) {
      attrs[key] = undefined
    }
  }

  if (originAttr) {
    attrs[keyWord][keyWord] = originAttr
  }
}