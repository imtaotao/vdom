import { parseHtml } from './parse-html'
import { optimize } from './static-majorization'

export function createAst (html) {
	const ast = parseHtml(html.trim())
	optimize(ast[0] || {})
}