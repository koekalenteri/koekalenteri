process.env.BABEL_ENV = 'development'
process.env.NODE_ENV = 'development'

process.on('unhandledRejection', (error) => {
  throw error
})

require('../config/env')

const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const paths = require('../config/paths')
const config = require('../config/webpack.config')('development')
const createDevServerConfig = require('../config/webpackDevServer.config')

const host = process.env.HOST || '0.0.0.0'
const port = Number.parseInt(process.env.PORT, 10) || 3000
const protocol = process.env.HTTPS === 'true' ? 'https' : 'http'
const browserHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host

async function start() {
  const compiler = webpack(config)
  const server = new WebpackDevServer(
    {
      ...createDevServerConfig(),
      host,
      open: process.env.BROWSER !== 'none' && process.env.CI !== 'true',
      port,
    },
    compiler
  )

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await server.stop()
      process.exit()
    })
  }

  await server.start()
  console.log(`Development server: ${protocol}://${browserHost}:${port}${paths.publicUrlOrPath}`)
}

start().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
