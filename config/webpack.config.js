const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const { WebpackManifestPlugin } = require('webpack-manifest-plugin')
const WorkboxWebpackPlugin = require('workbox-webpack-plugin')
const paths = require('./paths')
const getClientEnvironment = require('./env')
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin')
const { EsbuildPlugin } = require('esbuild-loader')

const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash')

// Source maps are resource heavy and can cause out of memory issue for large source files.
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false'

const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000')

class EmitServiceWorkerPlugin {
  constructor(swSrc) {
    this.swSrc = swSrc
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap('EmitServiceWorkerPlugin', (compilation) => {
      compilation.fileDependencies.add(this.swSrc)
      compilation.hooks.processAssets.tap(
        {
          name: 'EmitServiceWorkerPlugin',
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          compilation.emitAsset('service-worker.js', new webpack.sources.RawSource(fs.readFileSync(this.swSrc)))
        }
      )
    })
  }
}

const excludeNonShellAssets = ({ asset, compilation }) => {
  const entrypoint = compilation.entrypoints.get('main')
  if (!entrypoint) {
    throw new Error('InjectManifest: no "main" entrypoint; precache shell would be incomplete')
  }

  const initialAssets = entrypoint.getFiles()
  return asset.name !== 'index.html' && !initialAssets.includes(asset.name)
}

// style files regexes
const cssRegex = /\.css$/
const cssModuleRegex = /\.module\.css$/

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development'
  const isEnvProduction = webpackEnv === 'production'

  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  const isEnvProductionProfile = isEnvProduction && process.argv.includes('--profile')

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1))

  const shouldUseReactRefresh = env.raw.FAST_REFRESH

  // common function to get style loaders
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve('style-loader'),
      isEnvProduction && {
        loader: MiniCssExtractPlugin.loader,
        // css is located in `static/css`, use '../../' to locate index.html folder
        // in production `paths.publicUrlOrPath` can be a relative path
        options: paths.publicUrlOrPath.startsWith('.') ? { publicPath: '../../' } : {},
      },
      {
        loader: require.resolve('css-loader'),
        options: cssOptions,
      },
    ].filter(Boolean)
    if (preProcessor) {
      loaders.push({
        loader: require.resolve(preProcessor),
        options: {
          sourceMap: true,
        },
      })
    }
    return loaders
  }

  return {
    target: ['browserslist'],
    // Webpack noise constrained to errors and warnings
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    // Stop compilation early in production
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment && 'cheap-module-source-map',
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    entry: paths.appIndexJs,
    output: {
      // The build folder.
      path: paths.appBuild,
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: isEnvDevelopment,
      // There will be one main bundle, and one file per asynchronous chunk.
      // In development, it does not produce real files.
      filename: isEnvProduction ? 'static/js/[id].[contenthash:8].js' : isEnvDevelopment && 'static/js/[name].dev.js',
      // There are also additional JS chunk files if you use code splitting.
      chunkFilename: isEnvProduction
        ? 'static/js/[id].[contenthash:8].js'
        : isEnvDevelopment && 'static/js/[name].dev.js',
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      // webpack uses `publicPath` to determine where the app is being served from.
      // It requires a trailing slash, or the file assets will get an incorrect path.
      // We inferred the "public path" (such as / or /my-project) from homepage.
      publicPath: paths.publicUrlOrPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: isEnvProduction
        ? (info) => path.relative(paths.appSrc, info.absoluteResourcePath).replace(/\\/g, '/')
        : isEnvDevelopment && ((info) => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
    },
    cache: {
      type: 'filesystem',
      version: createEnvironmentHash(env.raw),
      cacheDirectory: paths.appWebpackCache,
      store: 'pack',
      buildDependencies: {
        defaultWebpack: ['webpack/lib/'],
        config: [__filename],
        tsconfig: [paths.appTsConfig],
      },
    },
    infrastructureLogging: {
      level: 'warn',
    },
    optimization: {
      chunkIds: isEnvProduction ? 'deterministic' : 'named',
      moduleIds: isEnvProduction ? 'deterministic' : 'named',
      minimize: isEnvProduction,
      minimizer: [
        new EsbuildPlugin({
          target: 'es2020',
          css: true,
        }),
      ],
      runtimeChunk: {
        name: 'runtime',
      },
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          aws: {
            name: 'aws',
            priority: 1,
            test: /[\\/]node_modules[\\/]aws/,
          },
          awsAuth: {
            name: 'aws-auth',
            priority: 1,
            test: /[\\/]node_modules[\\/]@aws-amplify[\\/]auth/,
          },
          awsCore: {
            name: 'aws-core',
            priority: 1,
            test: /[\\/]node_modules[\\/]@aws-amplify[\\/]core/,
          },
          awsCrypto: {
            name: 'aws-crypto',
            priority: 1,
            test: /[\\/]node_modules[\\/]@aws-crypto/,
          },
          awsUi: {
            name: 'aws-ui',
            priority: 1,
            test: /[\\/]node_modules[\\/]@aws-amplify[\\/]ui/,
          },
          dateFns: {
            name: 'date-fns',
            priority: 1,
            test: /[\\/]node_modules[\\/]date-fns/,
          },
          emotion: {
            name: 'emotion',
            priority: 1,
            test: /[\\/]node_modules[\\/]@emotion/,
          },
          handlebars: {
            name: 'handlebars',
            priority: 1,
            test: /[\\/]node_modules[\\/]handlebars/,
          },
          i18next: {
            name: 'i18next',
            priority: 1,
            test: /[\\/]node_modules[\\/]i18next/,
          },
          mui: {
            name: 'mui',
            priority: 1,
            test: /[\\/]node_modules[\\/]@mui/,
          },
          notistack: {
            name: 'notistack',
            priority: 1,
            test: /[\\/]node_modules[\\/]notistack/,
          },
          recoil: {
            name: 'recoil',
            priority: 1,
            test: /[\\/]node_modules[\\/]recoil/,
          },
          reactDom: {
            name: 'react-dom',
            priority: 1,
            test: /[\\/]node_modules[\\/]react-dom/,
          },
          reactRouter: {
            name: 'react-router',
            priority: 1,
            test: /[\\/]node_modules[\\/]react-router/,
          },
          xstate: {
            name: 'xstate',
            priority: 1,
            test: /[\\/]node_modules[\\/](@xstate|xstate)/,
          },

          muiData: {
            name: 'mui-x-data',
            priority: 2,
            test: /[\\/]node_modules[\\/]@mui[\\/]x-data/,
          },
          muiMaterial: {
            name: 'mui-material',
            priority: 2,
            test: /[\\/]node_modules[\\/]@mui[\\/]material/,
          },
          muiTel: {
            name: 'mui-tel-input',
            priority: 2,
            test: /[\\/]node_modules[\\/]mui-tel-input/,
          },

          muiLocale: {
            name: 'mui-locale',
            priority: 3,
            test: /[\\/]node_modules[\\/]@mui[\\/]material[\\/]locale/,
          },

          styles: {
            priority: 10,
            name(module) {
              const match = /[\\/](.*).css/.exec(module.context)

              if (!match) {
                return false
              }

              const moduleName = match[1]

              return moduleName
            },
            test: /\.css$/,
            chunks: 'all',
            enforce: true,
          },
        },
      },
    },
    resolve: {
      // Resolve the source extensions used by this project.
      extensions: paths.moduleFileExtensions.map((ext) => `.${ext}`),
      alias: {
        // Allows for better profiling with ReactDevTools
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
      },
    },
    module: {
      strictExportPresence: true,
      parser: {
        javascript: {
          importExportsPresence: 'warn', // this is lowered to warn from default err for react-router 7.7.0+ to function with react 18.
        },
      },
      rules: [
        // Handle node_modules packages that contain sourcemaps
        shouldUseSourceMap && {
          enforce: 'pre',
          exclude: /@babel(?:\/|\\{1,2})runtime/,
          test: /\.(js|mjs|jsx|ts|tsx|css)$/,
          loader: require.resolve('source-map-loader'),
        },
        {
          // "oneOf" will traverse all following loaders until one will
          // match the requirements. When no loader matches it will fall
          // back to the "file" loader at the end of the loader list.
          oneOf: [
            // TODO: Merge this config once `image/avif` is in the mime-db
            // https://github.com/jshttp/mime-db
            {
              test: [/\.avif$/],
              type: 'asset',
              mimetype: 'image/avif',
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            // "url" loader works like "file" loader except that it embeds assets
            // smaller than specified limit in bytes as data URLs to avoid requests.
            // A missing `test` is equivalent to a match.
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              type: 'asset',
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            {
              test: /\.svg$/,
              use: [
                {
                  loader: require.resolve('@svgr/webpack'),
                  options: {
                    prettier: false,
                    svgo: false,
                    svgoConfig: {
                      plugins: [{ removeViewBox: false }],
                    },
                    titleProp: true,
                    ref: true,
                  },
                },
                {
                  loader: require.resolve('file-loader'),
                  options: {
                    name: 'static/media/[name].[hash].[ext]',
                  },
                },
              ],
              issuer: {
                and: [/\.(ts|tsx|js|jsx|md|mdx)$/],
              },
            },
            // Process application JS with Babel.
            // The preset handles JSX, TypeScript, and targeted JavaScript transforms.
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: paths.appSrc,
              loader: require.resolve('babel-loader'),
              options: {
                presets: [require.resolve('./babelPreset')],

                plugins: [isEnvDevelopment && shouldUseReactRefresh && require.resolve('react-refresh/babel')].filter(
                  Boolean
                ),
                // This is a feature of `babel-loader` for webpack (not Babel itself).
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,
                compact: isEnvProduction,
              },
            },
            // Process any JS outside of the app with Esbuild.
            // Unlike the application JS, we only compile the standard ES features.
            {
              test: /\.(js|mjs)$/,
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve('esbuild-loader'),
              options: {
                target: 'es2020',
                tsconfigRaw: '',
              },
            },
            // "css" loader resolves paths in CSS and adds assets as dependencies.
            // "style" loader turns CSS into JS modules that inject <style> tags.
            // In production, we use MiniCSSExtractPlugin to extract that CSS
            // to a file, but in development "style" loader enables hot editing
            // of CSS.
            // By default we support CSS Modules with the extension .module.css
            {
              test: cssRegex,
              exclude: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                modules: {
                  mode: 'icss',
                },
              }),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules (https://github.com/css-modules/css-modules)
            // using the extension .module.css
            {
              test: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                modules: {
                  mode: 'local',
                  localIdentName: '[name]__[local]___[hash:base64:5]',
                },
              }),
            },
            // "file" loader makes sure those assets get served by WebpackDevServer.
            // When you `import` an asset, you get its (virtual) filename.
            // In production, they would get copied to the `build` folder.
            // This loader doesn't use a "test" so it will catch all modules
            // that fall through the other loaders.
            {
              // Exclude `js` files to keep "css" loader working as it injects
              // its runtime that would otherwise be processed through "file" loader.
              // Also exclude `html` and `json` extensions so they get processed
              // by webpacks internal loaders.
              exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              type: 'asset/resource',
            },
            // ** STOP ** Are you adding a new loader?
            // Make sure to add the new loader(s) before the "file" loader.
          ],
        },
      ].filter(Boolean),
    },
    plugins: [
      // Generates an `index.html` file with the <script> injected.
      new HtmlWebpackPlugin(
        Object.assign(
          {},
          {
            inject: true,
            template: paths.appHtml,
            templateParameters: env.raw,
          },
          isEnvProduction
            ? {
                minify: {
                  removeComments: true,
                  collapseWhitespace: true,
                  removeRedundantAttributes: true,
                  useShortDoctype: true,
                  removeEmptyAttributes: true,
                  removeStyleLinkTypeAttributes: true,
                  keepClosingSlash: true,
                  minifyJS: true,
                  minifyCSS: true,
                  minifyURLs: true,
                },
              }
            : undefined
        )
      ),
      // Makes some environment variables available to the JS code, for example:
      // if (process.env.NODE_ENV === 'production') { ... }. See `./env.js`.
      // It is absolutely essential that NODE_ENV is set to production
      // during a production build.
      // Otherwise React will be compiled in the very slow development mode.
      new webpack.DefinePlugin({
        ...env.stringified,
        __BUILD_TIMESTAMP__: JSON.stringify(Date.now()),
      }),
      // Experimental hot reloading for React .
      // https://github.com/facebook/react/tree/main/packages/react-refresh
      isEnvDevelopment &&
        shouldUseReactRefresh &&
        new ReactRefreshWebpackPlugin({
          overlay: false,
        }),
      isEnvProduction &&
        new MiniCssExtractPlugin({
          // Options similar to the same options in webpackOptions.output
          // both options are optional
          filename: isEnvProduction ? 'static/css/[id].[contenthash:8].css' : 'static/css/[name].dev.css',
          chunkFilename: isEnvProduction ? 'static/css/[id].[contenthash:8].css' : 'static/css/[name].dev.css',
        }),
      // Generate an asset manifest file with the following content:
      // - "files" key: Mapping of all asset filenames to their corresponding
      //   output file so that tools can pick it up without having to parse
      //   `index.html`
      // - "entrypoints" key: Array of files which are included in `index.html`,
      //   can be used to reconstruct the HTML if necessary
      new WebpackManifestPlugin({
        fileName: 'asset-manifest.json',
        publicPath: paths.publicUrlOrPath,
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path
            return manifest
          }, seed)
          const entrypointFiles = entrypoints.main.filter((fileName) => !fileName.endsWith('.map'))

          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          }
        },
      }),
      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
      isEnvProduction &&
        (process.env.REACT_APP_DISABLE_SERVICE_WORKER === 'true'
          ? new EmitServiceWorkerPlugin(paths.swUnregisterSrc)
          : new WorkboxWebpackPlugin.InjectManifest({
              swSrc: paths.swSrc,
              dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
              // Cache index.html and every initial script/style as one atomic shell.
              // Lazy route chunks and media continue to load on demand.
              exclude: [excludeNonShellAssets],
            })),
    ].filter(Boolean),
    // Bundle-size limits are monitored separately from webpack compilation.
    performance: false,
  }
}
