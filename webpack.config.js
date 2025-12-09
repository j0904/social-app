const createExpoWebpackConfigAsync = require('@expo/webpack-config')
const {withAlias} = require('@expo/webpack-config/addons')
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin')
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer')
const {sentryWebpackPlugin} = require('@sentry/webpack-plugin')
const {version} = require('./package.json')
const webpack = require('webpack')

const GENERATE_STATS = process.env.EXPO_PUBLIC_GENERATE_STATS === '1'
const OPEN_ANALYZER = process.env.EXPO_PUBLIC_OPEN_ANALYZER === '1'

const reactNativeWebWebviewConfiguration = {
  test: /postMock.html$/,
  use: {
    loader: 'file-loader',
    options: {
      name: '[name].[ext]',
    },
  },
}

module.exports = async function (env, argv) {
  let config = await createExpoWebpackConfigAsync(env, argv)
  config = withAlias(config, {
    'react-native$': 'react-native-web',
    'react-native-webview': 'react-native-web-webview',
  })
  config.module.rules = [
    ...(config.module.rules || []),
    reactNativeWebWebviewConfiguration,
  ]
  if (env.mode === 'development') {
    config.plugins.push(new ReactRefreshWebpackPlugin())
  } else {
    // Support static CDN for chunks
    config.output.publicPath = 'auto'
  }

  if (GENERATE_STATS || OPEN_ANALYZER) {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        openAnalyzer: OPEN_ANALYZER,
        generateStatsFile: true,
        statsFilename: '../stats.json',
        analyzerMode: OPEN_ANALYZER ? 'server' : 'json',
        defaultSizes: 'parsed',
      }),
    )
  }
  if (process.env.SENTRY_AUTH_TOKEN) {
    config.plugins.push(
      sentryWebpackPlugin({
        org: 'blueskyweb',
        project: 'app',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: {
          // fallback needed for Render.com deployments
          name: process.env.SENTRY_RELEASE || version,
          dist: process.env.SENTRY_DIST,
        },
      }),
    )
  }

  // Add Node.js polyfills for packages that require them
  if (!config.resolve) {
    config.resolve = {}
  }
  if (!config.resolve.fallback) {
    config.resolve.fallback = {}
  }

  // Add fallbacks for Node.js built-in modules
  Object.assign(config.resolve.fallback, {
    zlib: require.resolve('browserify-zlib'),
    buffer: require.resolve('buffer'),
    stream: require.resolve('stream-browserify'),
    util: require.resolve('util'),
    crypto: require.resolve('crypto-browserify'),
    assert: require.resolve('assert'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    os: require.resolve('os-browserify/browser'),
    url: require.resolve('url'),
    vm: require.resolve('vm-browserify'),
    events: require.resolve('events'),
    path: require.resolve('path-browserify'),
    querystring: require.resolve('querystring-es3'),
    'http-browserify': require.resolve('http-browserify'),
    'https-browserify': require.resolve('https-browserify'),
  })

  // Also add alias for specific modules to handle direct imports
  if (!config.resolve.alias) {
    config.resolve.alias = {}
  }
  Object.assign(config.resolve.alias, {
    zlib: require.resolve('browserify-zlib'),
    buffer: require.resolve('buffer'),
    stream: require.resolve('stream-browserify'),
    util: require.resolve('util'),
    crypto: require.resolve('crypto-browserify'),
    assert: require.resolve('assert'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    os: require.resolve('os-browserify/browser'),
    url: require.resolve('url'),
  })

  // Provide global variables that some packages expect
  config.plugins.push(
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser.js',
    }),
  )

  return config
}
