const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Register tflite extension for Annat's model
config.resolver.assetExts.push('tflite');

module.exports = config;