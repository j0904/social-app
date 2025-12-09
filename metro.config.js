// Learn more: https://docs.expo.dev/guides/monorepos/#create-a-metro-config
const {getDefaultConfig} = require('@expo/metro-config')

const config = getDefaultConfig(__dirname)

// Add resolver to handle Node.js modules
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
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
    process: require.resolve('process/browser.js'),
  },
  resolverMainFields: ['browser', 'main'],
}

// Add the polyfill aliases
config.resolver.assetExts = config.resolver.assetExts.filter(
  ext => ext !== 'svg',
)
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg']

// Add the polyfill aliases
config.resolver.alias = {
  ...(config.resolver.alias || {}),
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
  process: require.resolve('process/browser.js'),
}

module.exports = config
