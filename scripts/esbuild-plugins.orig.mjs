import { existsSync, lstatSync } from 'fs'
import { join } from 'path'

const isDirectory = (path) => existsSync(path) && lstatSync(path).isDirectory()

const resolveLocalPath = (resolveDir, path) => {
  const fullPath = join(resolveDir, path)
  if (isDirectory(fullPath)) {
    return path + '/index.mjs'
  }
  return path + '.mjs'
}

export const addExtensions = {
  name: 'add-js-extension-to-local-imports-for-node',
  setup(build) {
    build.onResolve({ filter: /.*/ }, ({ path, importer, resolveDir }) => {
      if (!importer) return
      if (path.endsWith('.json')) {
        path = join(resolveDir, path)
        return { path, external: false }
      }
      if (path.includes('/')) {
        if (path.startsWith('.')) {
          path = resolveLocalPath(resolveDir, path)
        } else {
          const full = join('node_modules', path)
          if (existsSync(full) && lstatSync(full).isDirectory()) {
            if (full.includes('@date-fns/tz')) {
              // no change, handled in package.json
            } else if (existsSync(join(full, 'index.mjs'))) {
              path = join(path, 'index.mjs')
            } else if (existsSync(join(full, 'index.js'))) {
              path = join(path, 'index.js')
            }
          } else {
            if (existsSync(full + '.mjs')) {
              path += '.mjs'
            } else if (existsSync(full + '.js')) {
              path += '.js'
            }
          }
        }
      }
      return { path, external: true }
    })
  },
}

/**
 * Rewrite relative imports moved to layer. This requires NODE_PATH=opt/nodejs
 * For example
 * - '../../lib/...' becomes 'lib/...'
 * - '../lib/...' becomes 'lambda/lib/...'
 */
export const rewriteLayerImports = {
  name: 'rewrite-layer-imports',
  setup(build) {
    build.onResolve({ filter: /^(\.\.\/)+(.+)/ }, ({ path, importer, resolveDir }) => {
      if (!importer) return

      const local = resolveLocalPath(resolveDir, path)

      const depth = (local.match(/\.\.\//g) || []).length
      const withoutParents = local.replace(/^(\.\.\/)+/, '')

      if (depth >= 2) return { path: `/opt/nodejs/${withoutParents}`, external: true }
      if (depth === 1) return { path: `/opt/nodejs/lambda/${withoutParents}`, external: true }

      return { path: local, external: true }
    })
  },
}
