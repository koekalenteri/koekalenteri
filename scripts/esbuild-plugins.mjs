import { existsSync, lstatSync } from 'fs'
import { join } from 'path'

/**
 * Checks if a path exists and is a directory
 * @param {string} path - Path to check
 * @returns {boolean} True if path exists and is a directory
 */
const isDirectory = (path) => existsSync(path) && lstatSync(path).isDirectory()

/**
 * Resolves a local relative path, adding appropriate extension
 * @param {string} resolveDir - Base directory for resolution
 * @param {string} relativePath - Relative path to resolve
 * @returns {string} Resolved path with extension
 */
const resolveLocalPath = (resolveDir, relativePath) => {
  const fullPath = join(resolveDir, relativePath)
  return isDirectory(fullPath) ? `${relativePath}/index.mjs` : `${relativePath}.mjs`
}

/**
 * Resolves a node_modules import path, adding appropriate extension
 * @param {string} path - Import path to resolve
 * @returns {string} Resolved path with extension if needed
 */
const resolveNodeModulesPath = (path) => {
  const nmPath = join('node_modules', path)

  if (isDirectory(nmPath)) {
    if (existsSync(join(nmPath, 'index.mjs'))) {
      return join(path, 'index.mjs')
    }
    if (existsSync(join(nmPath, 'index.js'))) {
      return join(path, 'index.js')
    }
  } else {
    if (existsSync(`${nmPath}.mjs`)) {
      return `${path}.mjs`
    }
    if (existsSync(`${nmPath}.js`)) {
      return `${path}.js`
    }
  }

  return path
}

/**
 * Rewrites relative imports based on parent depth for Lambda layers
 * @param {string} resolveDir - Base directory for resolution
 * @param {string} path - Import path to rewrite
 * @returns {string} Rewritten path for Lambda layer
 */
const rewriteRelativeImport = (resolveDir, path) => {
  const localPath = resolveLocalPath(resolveDir, path)
  const parentDepth = (localPath.match(/\.\.\//g) || []).length
  const trimmedPath = localPath.replace(/^(\.\.\/)+/, '')

  if (parentDepth >= 2) {
    return `/opt/nodejs/${trimmedPath}`
  }
  if (parentDepth === 1) {
    return `/opt/nodejs/lambda/${trimmedPath}`
  }
  return localPath
}

/**
 * ESBuild plugin that modifies import paths for AWS Lambda compatibility
 * - Adds appropriate extensions to imports (.mjs, .js)
 * - Rewrites relative imports for Lambda layers
 * - Handles node_modules imports
 * - Resolves JSON imports
 */
export const modifyImportsPlugin = {
  name: 'modify-imports',
  setup(build) {
    // Special case for JSON imports, resolve absolute path if exists
    build.onResolve({ filter: /\.json$/ }, ({ path, resolveDir }) => {
      const fullPath = join(resolveDir, path)
      if (existsSync(fullPath)) {
        return { path: fullPath, external: false }
      }
      return null
    })

    // Handle all imports except JSON
    build.onResolve({ filter: /.*/ }, ({ path, importer, resolveDir }) => {
      // Skip if no importer (entry point)
      if (!importer) return null

      // Handle relative imports starting with ../
      if (/^(\.\.\/)+/.test(path)) {
        return {
          path: rewriteRelativeImport(resolveDir, path),
          external: true,
        }
      }

      // Handle imports with slashes (relative or node_modules)
      if (path.includes('/')) {
        if (path.startsWith('.')) {
          // Local relative import
          return {
            path: resolveLocalPath(resolveDir, path),
            external: true,
          }
        } else {
          // node_modules import
          const resolvedPath = resolveNodeModulesPath(path)
          return {
            path: `/opt/nodejs/node_modules/${resolvedPath}`,
            external: true,
          }
        }
      }

      // Bare import without slashes: externalize as is
      return { path, external: true }
    })
  },
}
