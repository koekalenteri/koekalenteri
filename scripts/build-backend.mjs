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

const lambdaCtx = await esbuild[mode]({
  entryPoints: lambdaEntryPoints,
  bundle: true,
  packages: 'external',
  logLevel: 'info',
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outdir: 'dist/lambda',
  outExtension: { '.js': '.mjs' },
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
