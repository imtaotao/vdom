import * as _ from '../utils'

// 匹配属性名
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/

// 匹配标签名(包括 - )
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)

// 匹配文本节点
const textRE = /[^<]*/
const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/

// 匹配注释节点,doctype,ie hack节点
const doctype = /^<!DOCTYPE [^>]+>/i
const comment = /^<!--/
const conditionalComment = /^<!\[/

// 匹配转义节点
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t'
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g

export const TEXT = 0 // 文本
export const STATICTAG = 1 // 静态节点
export const TAG = 2 // 元素节点



export function parseHtml (html) {
  let index = 0
  let ast = []
  let scope = ast

  filter()
  while(html) {
  	parseStart()
  	parseEnd()
  }

 	return ast

  function parseStart () {
  	const match = html.match(startTagOpen)
  	if (match && match[0]) {
  		const tagStr = match[0]
  		const tagName = match[1]
  		const tagNode = createTag(
  				tagName,
  				scope === ast
  					? null
  					: scope
  		)

  		if (scope !== ast) {
  			scope.children.push(tagNode)
  		} else {
  			ast.push(tagNode)
  		}
  		// 作用域下降
  		scope = tagNode
  		advance(tagStr.length)

			let end, attr, attrName, attrValue

  		while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
  			advance(attr[0].length)
  			attrName = attr[1]
				attrValue = attr[3] || attr[4] || attr[5]

  			if (/^v-|@|:+/.test(attrName)) {
          conversionDirection({ [attrName]: attrValue })
  			} else {
  				scope.attrs[attrName] = attrValue
				}
  		}

  		if (end[1] ) {
				scope.isUnaryTag = true
				scope.end = index
				scope = scope.parent
			} else {
				scope.isUnaryTag = false
			}
			advance(end[0].length)

			while (parseStaticTag()) {}
  	}
  }

  function parseStaticTag () {
  	filter()
  	const match = html.match(textRE)
  	let text
  	if (!match || !match[0]) { return false }
  	if (match && (text = match[0])) {
  		// 纯静态文本
  		if (!defaultTagRE.test(text)) {
  			const textNode = createStaticNode(text, scope)
  			advance(text.length)
  			textNode.end = index
  			scope.children.push(textNode)
  		} else {
  			const expression = parseTextExpression(text)
  			const staticTag = createStaticTag(text, expression, scope)
  			advance(text.length)
  			staticTag.end = index
  			scope.children.push(staticTag)
  		}
  	}
  	return true
  }

  function parseTextExpression (text) {
		let l = 0
		let first = true
		let match = null
		let resultText = ''
		const reg = new RegExp(defaultTagRE, 'g')

		while (match = reg.exec(text)) {
			resultText += first
			? `\`${text.slice(l, match.index)}\` + _s(${match[1]}) `
			: `+ \`${text.slice(l, match.index)}\` + _s(${match[1]}) `

			l = match.index + match[0].length
			first && (first = false)
		}

		return resultText
  }

  function parseEnd () {
  	const match = html.match(endTag)
  	if (match && match[0]) {
  		const [tagStr, tagName] = match
  		if (scope.type === TAG && scope.tagName === tagName) {
  			advance(tagStr.length)
  			scope.end = index
  			scope = scope.parent
  			// 当前标签结束后回到父级标签，继续解析静态内容，直到全部解析完毕
  			while (parseStaticTag()) {}
  		}
  	}
  }

  function filter () {
  	// 过滤注释
  	if (comment.test(html)) {
		  const commentEnd = html.indexOf('-->')
		  if (commentEnd >= 0) {
		    advance(commentEnd + 3)
		  }
		}

		// 过滤<![和]>注释的内容
		if (conditionalComment.test(html)) {
		  const conditionalEnd = html.indexOf(']>')

		  if (conditionalEnd >= 0) {
		    advance(conditionalEnd + 2)
		  }
		}

		// 过滤doctype
		const doctypeMatch = html.match(doctype)
		if (doctypeMatch) {
		  advance(doctypeMatch[0].length)
		}
  }

  function advance (n) {
    index += n
    html = html.substring(n)
	}

	function getForArgs (attr) {
		const args = /((\w+)|(\([^\(]+\)))\s+of\s+([\w\.\(\)]+)/g.exec(attr['v-for'])
		if (args) {
			let key = args[1]
			if (key.includes(',')) {
				key = key
					.replace(/[\(\)]/g, '')
					.split(',')
					.map(val => val.trim())
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
		let bind,on
    let key = Object.keys(vAttr)[0]

    if (key === 'v-for' && vAttr[key]) {
			const args = getForArgs(vAttr)

			scope.forMultipleArg = Array.isArray(args)
			scope.forArgs = args
			scope.for = true
		}

    if (key === 'v-if') {
      scope.if = true
    }
    if ((bind = key.match(/^(:)(.+)/))) {
      vAttr = {['v-bind' + key]: vAttr[key]}
    }
    if ((on = key.match(/^@(.+)/))) {
      vAttr = {['v-on:' + on[1]]: vAttr[key]}
    }
    scope.direction.push(vAttr)
  }

  function createTag (tagName, parent) {
  	const root = parent ? false : true
  	return {
  		type: TAG,
			tagName,
			isHTMLTag: _.isHTMLTag(tagName),
			isSvgTag: _.isSVG(tagName),
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
  		parent,
  		end: null,
  		expression,
  		content,
  	}
  }

  function createStaticNode (content, parent) {
  	return _createStaticNode(content, parent)
  }
}

export function _createStaticNode (content, parent, index = null) {
	return {
		type: TEXT,
		start: index,
		parent,
		end: null,
		content,
		static: true,
	}
}