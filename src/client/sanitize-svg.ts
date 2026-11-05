/**
 * Sanitize model-authored inline SVG before it enters the DOM.
 *
 * The lesson surface must be able to show a bespoke diagram without shipping a
 * browser-side script runtime or making an image request. The safe compromise
 * is a small SVG vocabulary: shapes, paths, text, gradients and grouping, with
 * no scripts, event handlers, external URLs, styles, foreignObject, `<use>` or
 * raster/image references. Unknown elements are dropped with their subtree.
 */

const ALLOWED_TAGS = new Map<string, string>([
  'svg', 'g', 'defs', 'title', 'desc',
  'linearGradient', 'radialGradient', 'stop',
  'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'text', 'tspan',
].map((tag) => [tag.toLowerCase(), tag]))

const ALLOWED_ATTRS = new Map<string, string>([
  'xmlns', 'viewBox', 'width', 'height', 'id', 'role', 'aria-label',
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'transform',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'points', 'font-size', 'font-family', 'font-weight', 'text-anchor',
  'dominant-baseline', 'offset', 'stop-color', 'gradientUnits',
].map((name) => [name.toLowerCase(), name]))

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function isAllowedValue(value: string): boolean {
  if (value.length > 4000) return false
  // Gradient references are local ids. Any other url() could reach the network.
  if (/url\s*\(/i.test(value) && !/url\s*\(\s*#/i.test(value)) return false
  return true
}

function serialize(node: Node): string {
  if (node.nodeType === 3) return escapeText(node.nodeValue ?? '')
  if (node.nodeType !== 1) return ''
  const element = node as Element
  const tag = ALLOWED_TAGS.get(element.tagName.toLowerCase())
  if (tag === undefined) return ''
  let attributes = ''
  for (const attribute of Array.from(element.attributes)) {
    const name = ALLOWED_ATTRS.get(attribute.name.toLowerCase())
    if (name === undefined || name.toLowerCase().startsWith('on')) continue
    if (!isAllowedValue(attribute.value)) continue
    attributes += ` ${name}="${escapeAttribute(attribute.value)}"`
  }
  const children = Array.from(element.childNodes).map(serialize).join('')
  return children === '' ? `<${tag}${attributes}/>` : `<${tag}${attributes}>${children}</${tag}>`
}

/** Return safe SVG markup, or null when the source is not a usable SVG. */
export function sanitizeSvg(source: string): string | null {
  if (typeof DOMParser === 'undefined') return null
  let document: Document
  try {
    document = new DOMParser().parseFromString(source, 'image/svg+xml')
  } catch { return null }
  const root = document.documentElement
  if (root === null || root.tagName.toLowerCase() !== 'svg') return null
  if (document.querySelector('parsererror') !== null) return null
  const safe = serialize(root)
  return safe.startsWith('<svg') ? safe : null
}
