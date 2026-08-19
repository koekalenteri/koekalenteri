const path = require('path')

module.exports = function babelPreset(api) {
  const environment = api.env()
  const isTest = environment === 'test'
  const isDevelopment = environment === 'development'
  const isProduction = environment === 'production'

  if (!isTest && !isDevelopment && !isProduction) {
    throw new Error(`Unsupported Babel environment: ${environment}`)
  }

  return {
    presets: [
      [
        require.resolve('@babel/preset-env'),
        isTest ? { targets: { node: 'current' } } : {},
      ],
      [
        require.resolve('@babel/preset-react'),
        {
          development: isDevelopment || isTest,
          runtime: 'automatic',
        },
      ],
      require.resolve('@babel/preset-typescript'),
    ],
    plugins: [
      [
        require.resolve('@babel/plugin-transform-runtime'),
        {
          absoluteRuntime: path.dirname(require.resolve('@babel/runtime/package.json')),
          version: require('@babel/runtime/package.json').version,
        },
      ],
    ],
  }
}
