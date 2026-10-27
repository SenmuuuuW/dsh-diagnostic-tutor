/**
 * A deliberately small MathML renderer.
 *
 * The host owns the conversion from TeX to MathML; the browser must not hand a
 * raw markup string to `dangerouslySetInnerHTML`. Instead this module parses the
 * stored MathML in the DOM, walks it, and rebuilds only the elements and
 * attributes on an allow-list. Anything unknown is unwrapped to its text, and
 * script/event/link attributes are dropped.
 */

import { createElement, type ReactNode } from 'react'

const ALLOWED_TAGS = new Set([
  'math', 'semantics', 'annotation', 'annotation-xml', 'mrow', 'mi', 'mo', 'mn', 'mtext',
  'mspace', 'mfrac', 'msqrt', 'mroot', 'msub', 'msup', 'msubsup', 'munder', 'mover',
  'munderover', 'mtable', 'mtr', 'mtd', 'mlabeledtr', 'mpadded', 'mphantom', 'menclose',
  'mmultiscripts', 'mstyle', 'merror',
])

const ALLOWED_ATTRS = new Set([
  'xmlns', 'display', 'mathvariant', 'stretchy', 'fence', 'separator', 'lspace', 'rspace',
  'accent', 'accentunder', 'linethickness', 'columnalign', 'rowspacing', 'columnspacing',
  'scriptlevel', 'displaystyle', 'encoding', 'width', 'height', 'depth', 'largeop',
  'movablelimits', 'symmetric', 'maxsize', 'minsize', 'form', 'notation', 'rowalign',
  'columnlines', 'rowlines', 'frame', 'framespacing',
])

function allowedAttribute(name: string): boolean {
  return ALLOWED_ATTRS.has(name) && !name.startsWith('on')
}

function convert(node: Node, key: number): ReactNode {
  if (node.nodeType === 3 /* Node.TEXT_NODE */) return node.textContent ?? ''
  if (node.nodeType !== 1 /* Node.ELEMENT_NODE */) return null
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  const children = [...element.childNodes].map((child, index) => convert(child, index))
  if (!ALLOWED_TAGS.has(tag)) return children
  const props: Record<string, string> = {}
  for (const attribute of [...element.attributes]) {
    if (allowedAttribute(attribute.name)) props[attribute.name] = attribute.value
  }
  return createElement(tag, { ...props, key }, ...children)
}

/** Render a host-produced MathML subtree, falling back to the caller's styled TeX. */
export function MathMLView({
  mathml,
  fallback,
}: {
  mathml: string | undefined
  fallback: ReactNode
}): ReactNode {
  if (mathml === undefined || mathml.length === 0) return fallback
  if (typeof DOMParser === 'undefined') return fallback
  try {
    const document = new DOMParser().parseFromString(mathml, 'text/html')
    const root = document.querySelector('math')
    if (root === null) return fallback
    return convert(root, 0)
  } catch {
    return fallback
  }
}
