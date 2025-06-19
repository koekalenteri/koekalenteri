import * as esbuild from 'esbuild'
import { existsSync, lstatSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

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

const exclude = ['src/i18n/index.ts', 'src/lambda/jest.config.ts']
const paths = ['src/lambda', 'src/i18n', 'src/lib']
const entryPoints = paths
  .map((path) => getEntryPoints(path, '.ts'))
  .flat()
  .filter((entry) => !exclude.includes(entry))
  .filter((entry) => !entry.includes('mock') && !entry.includes('lib/client'))
const watch = process.argv[2] === '--watch'
const mode = watch ? 'context' : 'build'

const ctx = await esbuild[mode]({
  entryPoints,
  bundle: true,
  logLevel: 'info',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
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
              if (path.startsWith('.')) {
                const full = join(resolveDir, path)
                if (existsSync(full) && lstatSync(full).isDirectory()) {
                  path = path + '/index.mjs'
                } else {
                  path = path + '.mjs'
                }
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
