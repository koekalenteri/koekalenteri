import { existsSync, lstatSync } from 'fs'
import { join, relative, resolve } from 'path'

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
 * @param {Object} options - Configuration options
 * @param {boolean} options.isLambda - Whether this is a Lambda function (adds 'lambda' to path)
 * @returns {string} Rewritten path for Lambda layer
 */
const rewriteRelativeImport = (resolveDir, path, { isLambda = false } = {}) => {
  const localPath = resolveLocalPath(resolveDir, path)

  // Resolve against src/ so we can map to the deployed layer structure reliably.
  // This avoids lossy heuristics based only on parent depth.
  const absResolveDir = resolve(resolveDir)
  const absTarget = resolve(absResolveDir, localPath)
  const fromSrcRoot = relative(resolve('src'), absTarget).replaceAll('\\', '/')

  // In layer build, keep imports relative inside lambda subtree when both
  // importer and imported module are under src/lambda/**.
  if (!isLambda) {
    const importerFromSrcRoot = relative(resolve('src'), absResolveDir).replaceAll('\\', '/')
    if (importerFromSrcRoot.startsWith('lambda/') && fromSrcRoot.startsWith('lambda/')) {
      const relInsideLambda = relative(absResolveDir, absTarget).replaceAll('\\', '/')
      return relInsideLambda.startsWith('.') ? relInsideLambda : `./${relInsideLambda}`
    }
  }

  // Imports that resolve under src/ map 1:1 into /opt/nodejs/<relative path>
  // in layer output (e.g. src/lambda/config.ts -> /opt/nodejs/lambda/config.mjs).
  return `/opt/nodejs/${fromSrcRoot.replace(/\.(ts|js|mjs)$/, '.mjs')}`
}

/**
 * ESBuild plugin that modifies import paths for AWS Lambda compatibility
 * - Adds appropriate extensions to imports (.mjs, .js)
 * - Rewrites relative imports for Lambda layers
 * - Handles node_modules imports
 * - Resolves JSON imports
 * @param {Object} options - Configuration options
 * @param {boolean} options.isLambda - Whether this is a Lambda function (adds 'lambda' to path)
 */
export const modifyImportsPlugin = (options = { isLambda: false }) => ({
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
          path: rewriteRelativeImport(resolveDir, path, options),
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
          /*
        } else if (path.startsWith('@')) {
          // Scoped package import (e.g. @date-fns/tz)
          return {
            path,
            external: true,
          }
        } else {
          // node_modules import
          const resolvedPath = resolveNodeModulesPath(path)
          return {
            path: `/opt/nodejs/node_modules/${resolvedPath}`,
            external: true,
          }
            */
        }
      }

      // Bare import without slashes: externalize as is
      return { path, external: true }
    })
  },
})
