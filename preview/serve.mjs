/**
 * Standalone preview server.
 *
 * Serves the repository root so the page can reach `/lib/client.js` (the real
 * built bundle) and React's UMD builds from `node_modules`. That is the whole
 * point: the preview renders the *actual* client bundle, not a copy of it, so
 * what you see is what ships.
 *
 *   pnpm build && pnpm preview      # then open the printed URL
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.env.PORT ?? 8391)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const requested = url.pathname === '/' ? '/preview/index.html' : url.pathname

  // Contain every read to the repository root.
  const target = join(ROOT, normalize(requested).replace(/^(\.\.[/\\])+/, ''))
  if (!target.startsWith(ROOT)) {
    res.statusCode = 403
    res.end('forbidden')
    return
  }

  try {
    const body = await readFile(target)
    res.statusCode = 200
    res.setHeader('content-type', TYPES[extname(target)] ?? 'application/octet-stream')
    res.setHeader('cache-control', 'no-store')
    res.end(body)
  } catch {
    res.statusCode = 404
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(
      `not found: ${requested}\n\nIf /lib/client.js is missing, run \`pnpm build\` first.\n`,
    )
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`diagnostic-tutor preview → http://127.0.0.1:${PORT}/`)
})
