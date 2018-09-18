import bind from './bind'
import runExecuteContext from './execution-env'
import * as _ from '../utils/index'

export default function show (val, comp, vnodeConf) {
  const code = `
    with($obj_) {
      return !!(${val});
    }`

  const isShow = !!runExecuteContext(code, 'show', vnodeConf.tagName, comp)

  const bindValue = {
    attrName: 'style',
    value: isShow
      ? ''
      : 'display: none',
  }

  vnodeConf.isShow = isShow

  if (_.isReservedTag(vnodeConf.tagName)) {
    bind(bindValue, comp, vnodeConf)
    return
  }

  vnodeConf.vShowResult = bindValue
}