/**
 * Browser trust fence for this plugin's HTTP surface.
 *
 * A bare `ctx.webServer.register()` route inherits **no authentication** — the
 * framework does not wrap third-party routes, and its own gateway fence is
 * package-internal. Every published plugin therefore re-implements the same
 * behaviour, and so does this one.
 *
 * What it defends against: a page on another origin (or a DNS-rebound hostname)
 * reaching these routes from the user's browser. The rule is that a request
 * must arrive at a **loopback** host, from a **loopback** origin, and must not
 * be marked cross-site.
 *
 * Deliberately a *behavioural* replica of
 * `@deepseek-ai/dsh-client-connection`'s `api-request-trust.ts` /
 * `loopback-hostname.ts`, not an import: those are not exported for third
 * parties, and importing across a harness cohort is exactly what this project's
 * cross-version discipline forbids.
 *
 * Anything that fails the fence gets 403 and no body, so a rejected caller
 * learns nothing about what is behind it.
 */

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'

/** The only part of a request the fence inspects. */
export interface ApiTrustRequest {
  headers: IncomingHttpHeaders
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/**
 * Whether a hostname is this machine.
 *
 * `localhost`, IPv6 loopback, and any `127.0.0.0/8` address. Everything else —
 * including a public name that resolves to 127.0.0.1 through DNS rebinding — is
 * rejected, because the *name* is what an attacker controls.
 *
 * @param hostname - the hostname from a Host or Origin header.
 * @returns whether it denotes the local machine.
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

/**
 * Whether a request may reach the plugin API.
 *
 * @param request - the incoming request (only `headers` is read).
 * @returns whether the request is same-origin and local.
 */
export function isTrustedApiRequest(request: ApiTrustRequest): boolean {
  const host = header(request.headers, 'host')
  if (host === undefined) return false

  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false

  const origin = header(request.headers, 'origin')
  if (origin !== undefined) {
    let originUrl: URL
    try {
      originUrl = new URL(origin)
    } catch {
      return false
    }
    if (!isLoopbackHostname(originUrl.hostname)) return false
  }

  // `same-origin` is a normal fetch from the page; `none` is a direct
  // navigation or a non-browser client. Anything else is cross-site.
  const fetchSite = header(request.headers, 'sec-fetch-site')
  if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return false
  }

  return true
}

/**
 * Wrap a handler so it only runs for trusted requests.
 *
 * @param handler - the route body.
 * @returns a handler that answers 403 without a body when the fence rejects.
 */
export function guarded(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (!isTrustedApiRequest(req)) {
      res.statusCode = 403
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: { code: 'forbidden' } }))
      return
    }
    await handler(req, res)
  }
}
