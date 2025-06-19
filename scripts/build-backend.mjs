import { spawn } from 'child_process'
import * as esbuild from 'esbuild'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

import { modifyImportsPlugin } from './esbuild-plugins.mjs'

function getEntryPoints(dir, ext, excludeDirs) {
  const result = []
  for (const file of readdirSync(dir)) {
    const full = join(dir, file)
    if (statSync(full).isDirectory()) {
      if (/test/.test(full) || excludeDirs?.includes(full)) continue
      result.push(...getEntryPoints(full, ext))
    } else if (full.endsWith(ext) && !full.endsWith(`.test${ext}`) && !full.endsWith(`.d${ext}`)) {
      result.push(full)
    }
  }
  return result
}

const exclude = ['src/i18n/index.ts', 'src/lambda/jest.config.ts']
const lambdaExclude = ['src/lambda/lib', 'src/lambda/utils', 'src/lambda/types']

const layerPaths = ['src/i18n', 'src/lib', 'src/lambda/lib', 'src/lambda/utils', 'src/lambda/types']
const lambdaPaths = ['src/lambda']

const layerEntryPoints = layerPaths
  .map((path) => getEntryPoints(path, '.ts'))
  .flat()
  .filter((entry) => !exclude.includes(entry))
  .filter((entry) => !entry.includes('mock') && !entry.includes('lib/client'))

// include config
layerEntryPoints.push('src/lambda/config.ts')

const lambdaEntryPoints = lambdaPaths
  .map((path) => getEntryPoints(path, '.ts', lambdaExclude))
  .flat()
  .filter((entry) => !exclude.includes(entry))
  .filter((entry) => !entry.includes('mock') && !entry.includes('lib/client'))

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

const layerCtx = await esbuild[mode]({
  entryPoints: layerEntryPoints,
  bundle: true,
  logLevel: 'info',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outdir: 'dist/layer/nodejs',
  outExtension: { '.js': '.mjs' },
  plugins: [modifyImportsPlugin({ isLambda: false })],
})

const lambdaCtx = await esbuild[mode]({
  entryPoints: lambdaEntryPoints,
  bundle: true,
  logLevel: 'info',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outdir: 'dist/lambda',
  outExtension: { '.js': '.mjs' },
  plugins: [modifyImportsPlugin({ isLambda: true })],
})

if (watch) {
  await layerCtx.watch()
  await lambdaCtx.watch()
  console.log('watching for changes...')

  // In watch mode, templateBuildPromise resolves immediately
  // and the template build process continues running in the background
} else {
  // In build mode, wait for template build to complete
  await templateBuildPromise
}
