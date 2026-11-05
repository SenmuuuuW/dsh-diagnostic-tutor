// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { sanitizeSvg } from '../src/client/sanitize-svg.js'

describe('inline SVG sanitizer', () => {
  it('keeps the allowed drawing vocabulary', () => {
    const safe = sanitizeSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#2563eb"/><path d="M0 0 L10 10"/><text x="1" y="9">A</text></svg>')
    expect(safe).toContain('<circle')
    expect(safe).toContain('<path')
    expect(safe).toContain('>A</text>')
    expect(safe).toContain('viewBox="0 0 10 10"')
  })

  it('drops scripts, event handlers, foreignObject and external references', () => {
    const safe = sanitizeSvg('<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><foreignObject><div>x</div></foreignObject><image href="https://example.com/x.png"/><a href="javascript:alert(1)"><circle r="2"/></a><circle r="3" fill="url(https://example.com/x)" onclick="x()"/><rect width="4" height="4" style="fill:red"/></svg>')
    expect(safe).not.toContain('script')
    expect(safe).not.toContain('onload')
    expect(safe).not.toContain('foreignObject')
    expect(safe).not.toContain('example.com')
    expect(safe).not.toContain('javascript')
    expect(safe).not.toContain('style=')
    expect(safe).toContain('<circle')
    expect(safe).not.toContain('onclick')
  })

  it('returns null for malformed or non-svg input', () => {
    expect(sanitizeSvg('<div>x</div>')).toBeNull()
    expect(sanitizeSvg('<svg><')).toBeNull()
    expect(sanitizeSvg('')).toBeNull()
  })
})
