const path = require('path')
const fs = require('fs')

// Resolve paths from the physical project root so symlinks do not produce
// inconsistent webpack cache and module paths.
const appDirectory = fs.realpathSync(process.cwd())
const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath)

// We use `PUBLIC_URL` environment variable or "homepage" field to infer
// "public path" at which the app is served.
// webpack needs to know it to put the right <script> hrefs into HTML even in
// single-page apps that may serve index.html for nested URLs like /todos/42.
// We can't use a relative path in HTML because we don't want to load something
// like /todos/42/static/js/bundle.7289d.js. We have to know the root.
const homepage = require(resolveApp('package.json')).homepage
const configuredPublicUrl = process.env.PUBLIC_URL || homepage || '/'
const publicUrlWithSlash = `${configuredPublicUrl.replace(/\/$/, '')}/`
const publicUrlOrPath =
  process.env.NODE_ENV === 'development'
    ? new URL(publicUrlWithSlash, 'https://localhost').pathname
    : process.env.PUBLIC_URL || configuredPublicUrl.startsWith('.')
      ? publicUrlWithSlash
      : new URL(publicUrlWithSlash, 'https://localhost').pathname

const buildPath = process.env.BUILD_PATH || 'build'

const moduleFileExtensions = [
  'web.mjs',
  'mjs',
  'web.js',
  'js',
  'web.ts',
  'ts',
  'web.tsx',
  'tsx',
  'json',
  'web.jsx',
  'jsx',
]

// Resolve file paths in the same order as webpack
const resolveModule = (resolveFn, filePath) => {
  const extension = moduleFileExtensions.find((extension) => fs.existsSync(resolveFn(`${filePath}.${extension}`)))

  if (extension) {
    return resolveFn(`${filePath}.${extension}`)
  }

  return resolveFn(`${filePath}.js`)
}

module.exports = {
  dotenv: resolveApp('.env'),
  appPath: resolveApp('.'),
  appBuild: resolveApp(buildPath),
  appPublic: resolveApp('public'),
  appHtml: resolveApp('public/index.html'),
  appIndexJs: resolveModule(resolveApp, 'src/index'),
  appPackageJson: resolveApp('package.json'),
  appSrc: resolveApp('src'),
  appTsConfig: resolveApp('tsconfig.json'),
  testsSetup: resolveModule(resolveApp, 'src/setupTests'),
  appWebpackCache: resolveApp('node_modules/.cache'),
  appTsBuildInfoFile: resolveApp('node_modules/.cache/tsconfig.tsbuildinfo'),
  swSrc: resolveModule(resolveApp, 'src/service-worker'),
  swUnregisterSrc: resolveModule(resolveApp, 'src/service-worker-unregister'),
  publicUrlOrPath,
}

module.exports.moduleFileExtensions = moduleFileExtensions
