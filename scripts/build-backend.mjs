import { spawn } from 'child_process'
import * as esbuild from 'esbuild'
import { readdirSync, statSync } from 'fs'
import { basename, join } from 'path'

function getEntryPoints(dir, ext) {
  const result = []
  for (const file of readdirSync(dir)) {
    const full = join(dir, file)
    if (statSync(full).isDirectory()) {
      if (/test/.test(full)) continue
      result.push(...getEntryPoints(full, ext))
    } else if (full.endsWith(ext) && !full.endsWith(`.test${ext}`) && !full.endsWith(`.d${ext}`)) {
      result.push(full)
    }
  }
  return result
}

const lambdaPaths = ['src/lambda']

const lambdaEntryPoints = lambdaPaths
  .map((path) => getEntryPoints(path, '.ts'))
  .flat()
  .filter((entry) => basename(entry) === 'handler.ts')

const watch = process.argv.includes('--watch')
const mode = watch ? 'context' : 'build'

// Build template
async function buildTemplate() {
  return new Promise((resolve, reject) => {
    const args = ['./scripts/build-template.mjs', ...(watch ? ['--watch'] : [])]

    const templateProcess = spawn('node', args, {
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    if (!watch) {
      templateProcess.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Template build failed with code ${code}`))
        }
      })
    } else {
      // In watch mode, we don't wait for the process to close
      resolve()
    }
  })
}

// Start template build
const templateBuildPromise = buildTemplate()

// Every dependency is bundled into the function that uses it. The alternative -- leaving them
// external and shipping one shared layer -- meant every cold start paid for the union of all
// imports (26 MB of date-fns, a remark tree one single function uses), and a missing package
// surfaced as a production ERR_MODULE_NOT_FOUND instead of a build error.
const lambdaCtx = await esbuild[mode]({
  entryPoints: lambdaEntryPoints,
  bundle: true,
  minify: true,
  // Minified names would otherwise leak into error messages and `constructor.name` checks.
  keepNames: true,
  // Written next to the bundle and read by --enable-source-maps, so a production stack trace
  // points at the TypeScript source rather than at a column of the minified bundle.
  sourcemap: 'linked',
  logLevel: 'info',
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outdir: 'dist/lambda',
  outExtension: { '.js': '.mjs' },
  // Several bundled CommonJS dependencies (the Smithy HTTP handler, aws-embedded-metrics) call
  // `require` at runtime. In an ESM bundle esbuild's shim throws "Dynamic require of X is not
  // supported" unless a real `require` is in scope, so give them one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'\nconst require = __createRequire(import.meta.url)",
  },
})

if (watch) {
  await lambdaCtx.watch()
  console.log('watching for changes...')

  // In watch mode, templateBuildPromise resolves immediately
  // and the template build process continues running in the background
} else {
  // In build mode, wait for template build to complete
  await templateBuildPromise
}
