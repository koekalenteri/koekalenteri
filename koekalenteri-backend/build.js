import * as esbuild from 'esbuild'
import { existsSync, lstatSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

function getEntryPoints(dir, ext) {
  const result = []
  for (const file of readdirSync(dir)) {
    const full = join(dir, file)
    if (statSync(full).isDirectory()) {
      result.push(...getEntryPoints(full, ext))
    } else if (full.endsWith(ext) && !full.endsWith(`.test${ext}`)) {
      result.push(full)
    }
  }
  return result
}

const entryPoints = getEntryPoints('src', '.ts')
const watch = process.argv[2] === '--watch'
const mode = watch ? 'context' : 'build'

const ctx = await esbuild[mode]({
  entryPoints,
  bundle: true,
  logLevel: 'info',
  format: 'esm',
  platform: 'node',
  target: 'node16',
  outdir: 'dist',
  plugins: [
    {
      name: 'add-js-extension-to-local-imports-for-node',
      setup(build) {
        build.onResolve({ filter: /.*/ }, ({ path, importer, resolveDir }) => {
          if (importer) {
            if (path.endsWith('.json')) {
              path = join(resolveDir, path)
              return { path, external: false }
            }
            if (path.includes('/')) {
              const full = join(resolveDir, path)
              if (existsSync(full) && lstatSync(full).isDirectory()) {
                path = path + '/index.js'
              } else {
                path = path + '.js'
              }
            }
            return { path, external: true }
          }
        })
      },
    },
  ],
})

if (watch) {
  await ctx.watch()
  console.log('watching for changes...')
}
