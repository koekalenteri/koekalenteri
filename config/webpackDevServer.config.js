const paths = require('./paths')
const getHttpsConfig = require('./getHttpsConfig')

module.exports = function createDevServerConfig() {
  return {
    allowedHosts: 'auto',
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
      webSocketURL: {
        hostname: process.env.WDS_SOCKET_HOST,
        pathname: process.env.WDS_SOCKET_PATH,
        port: process.env.WDS_SOCKET_PORT,
      },
    },
    compress: true,
    devMiddleware: {
      publicPath: paths.publicUrlOrPath,
    },
    historyApiFallback: {
      disableDotRule: true,
      index: paths.publicUrlOrPath,
    },
    server: getHttpsConfig(),
    static: {
      directory: paths.appPublic,
      publicPath: [paths.publicUrlOrPath],
      watch: {
        ignored: ['**/node_modules/**'],
      },
    },
  }
}
