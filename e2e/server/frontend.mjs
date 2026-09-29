/**
 * Serves the e2e frontend build as Amplify hosting does: a file when one exists, otherwise
 * `index.html`, so a deep link such as `/event/NOME-B/abc` reaches the router.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { FRONTEND_PORT, frontendBuildEnv } from '../env.mjs'

const ROOT = path.resolve(frontendBuildEnv.BUILD_PATH)
const INDEX = path.join(ROOT, 'index.html')
if (!fs.existsSync(INDEX)) {
  console.error(`${INDEX} is missing; run npm run build-e2e-frontend first`)
  process.exit(1)
}

const TYPES = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const resolveFile = (pathname) => {
  const file = path.join(ROOT, decodeURIComponent(pathname))
  if (!file.startsWith(ROOT)) return INDEX
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? file : INDEX
}

http
  .createServer((req, res) => {
    const file = resolveFile(new URL(req.url ?? '/', 'http://localhost').pathname)
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  .listen(FRONTEND_PORT, () => console.log(`e2e frontend on :${FRONTEND_PORT}`))
