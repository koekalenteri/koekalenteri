import * as esbuild from 'esbuild'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs'
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

const watch = process.argv[2] === '--watch'
const mode = watch ? 'context' : 'build'

const layerCtx = await esbuild[mode]({
  entryPoints: layerEntryPoints,
  bundle: true,
  logLevel: 'info',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  // outdir: 'layer/nodejs',
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
  target: 'node18',
  outdir: 'dist/lambda',
  outExtension: { '.js': '.mjs' },
  plugins: [modifyImportsPlugin({ isLambda: true })],
})

/*
const entries = readdirSync('dist/lambda', { withFileTypes: true })

for (const entry of entries) {
  if (!entry.isDirectory()) continue

  const srcPath = path.resolve(path.join('dist/lambda', entry.name))
  const destPath = path.resolve(path.join('dist/sam/lambda', entry.name))

  try {
    symlinkSync(srcPath, destPath, 'dir')
    // console.log(`Linked: ${destPath} -> ${srcPath}`)
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.warn(`Already exists: ${destPath}`)
    } else {
      console.error(`Failed to link ${destPath}:`, err.message)
    }
  }
}
*/
/*
const links = ['lib', 'i18n', 'lambda/lib', 'lambda/types', 'lambda/utils', 'node_modules']

for (const link of links) {
  symlinkSync(path.resolve(`dist/layer/nodejs/${link}`), path.resolve(`dist/${link}`))
}
*/

// Generate package.json with "type": "module" for each lambda handler
const generatePackageJsonFiles = () => {
  const lambdaOutputDir = 'dist/lambda'
  const packageJson = JSON.stringify({ type: 'module' }, null, 2)

  // Find all lambda handler directories
  const lambdaHandlerDirs = lambdaEntryPoints
    .map((entry) => {
      // Extract the directory name from the entry point
      // e.g., src/lambda/DemoEventsFunction/handler.ts -> DemoEventsFunction
      const match = entry.match(/src\/lambda\/([^/]+)\//)
      return match ? match[1] : null
    })
    .filter(Boolean)
    .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates

  // Create package.json in each lambda handler output directory
  for (const dir of lambdaHandlerDirs) {
    const outputDir = join(lambdaOutputDir, dir)

    // Create directory if it doesn't exist
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    // Write package.json
    const packageJsonPath = join(outputDir, 'package.json')
    writeFileSync(packageJsonPath, packageJson)
    console.log(`Generated package.json in ${outputDir}`)
  }
}

// Generate package.json files after build
if (!watch) {
  generatePackageJsonFiles()
}

if (watch) {
  await layerCtx.watch()
  await lambdaCtx.watch()
  console.log('watching for changes...')

  // Also generate package.json files in watch mode
  generatePackageJsonFiles()
}
