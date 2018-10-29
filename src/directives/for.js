import * as _ from '../utils/index'
import scope from './scope'
import Watcher from '../observer/Watcher'
import { createVnodeConf } from './util'
import { parseSingleNode } from './index'
import runExecuteContext from './execution-env'

export default function vfor (node, component, vnodeConf) {
  if (!node.for || !node.forArgs) return

  if (!node.parent) {
    _.sendDirectWarn('v-for', component.name)
    return
  }

  const cloneNodes = []
  const watcherCollectList = {}
  const { key: keys, data, isMultiple } = node.forArgs

  const code = `
    var $data;

    with($obj_) { $data = ${data}; }

    if ($data) {
      $callback_($data);
    }

    return $data;
  `

  function loopData (data) {
    if (Array.isArray(data)) {
      for (let i = 0, len = data.length; i < len; i++) {
        const nodeKey = vnodeConf.indexKey + '_' + i
        addValue(isMultiple, data[i], i, i, nodeKey)
      }
    } else if (_.isObject(data)) {
      const dataKey = Object.keys(data)
      for (let i = 0, len = dataKey.length; i < len; i++) {
        const key = dataKey[i]
        const nodeKey = vnodeConf.indexKey + '_' + i
        const val = getValue(component, () => data[key], node, nodeKey)

        addValue(isMultiple, val, key, i, nodeKey)
      }
    }
  }

  function addValue (isMultiple, val, key, i, nodeKey) {
    if (isMultiple) {
      scope.add(keys[0], val);
      scope.add(keys[1], key);
    } else {
      scope.add(keys, val);
    }

    vforCallback(i, nodeKey)
  }

  function vforCallback (i, key) {
    const cloneNode = createVnodeConf(node, vnodeConf.parent)

    cloneNode.attrs['key'] = key
    cloneNode.indexKey = key

    // 我们要避免无限递归的进入 for 指令
    node.for = false
    
    cloneNodes[i] = parseSingleNode(node, component, cloneNode) === false
      ? null
      : cloneNode

    // 在 for 指令里面我们要记录当前节点是否已经收集依赖，因为有可能会有新成员的增加
    if (component.$isWatch) {
      watcherCollectList[key] = true
    }
  }

  scope.create()
  runExecuteContext(code, 'for', vnodeConf, component, loopData)
  scope.destroy()

  const index = serachIndex(vnodeConf)
  replaceWithLoopRes(vnodeConf, cloneNodes, index)
  node.for = true
  node.watcherCollectList = watcherCollectList
}

function serachIndex (node) {
  const children = node.parent.children
  const length = children.length
  for (let i = 0; i < length; i++) {
    if (children[i] === node) {
      return i
    }
  }
}

function replaceWithLoopRes (node, res, i) {
  const children = node.parent.children
  children.splice(i, 1, ...res)
}

function getValue (component, fun, astNode, nodeKey) {
  if (!component.$isWatch) {
    return fun()
  } else {
    // 避免重复的依赖收集，我们只对新添加的进行收集
    if (astNode.watcherCollectList[nodeKey]) {
      return fun()
    } else {
      let value
      new Watcher(component, () => {
        return value = fun()
      }, component.forceUpdate)
    
      return value
    }
  }
}