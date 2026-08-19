process.env.BABEL_ENV = 'production'
process.env.NODE_ENV = 'production'

process.on('unhandledRejection', (error) => {
  throw error
})

require('../config/env')

const path = require('path')
const { execFileSync } = require('child_process')
const fs = require('fs-extra')
const webpack = require('webpack')
const config = require('../config/webpack.config')('production')
const paths = require('../config/paths')

function formatIssue(issue) {
  return typeof issue === 'string' ? issue : issue.message || JSON.stringify(issue)
}

function compile() {
  const compiler = webpack(config)

  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      compiler.close(() => {})

      if (error) {
        reject(error)
        return
      }

      const result = stats.toJson({ all: false, errors: true, warnings: true })
      const errors = result.errors.map(formatIssue)
      const warnings = result.warnings.map(formatIssue)

      if (errors.length) {
        reject(new Error(errors.join('\n\n')))
        return
      }

      const ciWarnings = warnings
        .filter((warning) => !/Failed to parse source map/.test(warning))
        .filter((warning) => !warning.startsWith('Attempted import error'))
      if (process.env.CI && process.env.CI.toLowerCase() !== 'false' && ciWarnings.length) {
        reject(new Error(`Treating warnings as errors because CI is enabled.\n\n${ciWarnings.join('\n\n')}`))
        return
      }

      resolve({ stats, warnings })
    })
  })
}

async function build() {
  console.log('Type-checking the frontend...')
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', paths.appTsConfig], {
    stdio: 'inherit',
  })

  fs.emptyDirSync(paths.appBuild)
  fs.copySync(paths.appPublic, paths.appBuild, {
    dereference: true,
    filter: (file) => file !== paths.appHtml,
  })

  console.log('Creating an optimized production build...')
  const { stats, warnings } = await compile()

  if (warnings.length) {
    console.log('Compiled with warnings.\n')
    console.log(warnings.join('\n\n'))
  } else {
    console.log('Compiled successfully.')
  }

  const analyzerStats = stats.toJson({ all: true })
  analyzerStats.assets = Object.values(analyzerStats.namedChunkGroups ?? {})
    .flatMap((chunkGroup) =>
      (chunkGroup.assets ?? []).map((asset) => ({
        ...asset,
        chunks: chunkGroup.chunks ?? [],
        info: asset.info ?? { javascriptModule: false },
      }))
    )
    .filter(({ name }, index, assets) => assets.findIndex((asset) => asset.name === name) === index)
  analyzerStats.children = []
  fs.writeFileSync(path.join(paths.appBuild, 'stats.json'), JSON.stringify(analyzerStats))
  console.log(`Build output: ${path.relative(process.cwd(), paths.appBuild)}`)
}

build().catch((error) => {
  console.error('Failed to compile.\n')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
