const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for additional file extensions
config.resolver.assetExts.push('cjs');

// Add support for TypeScript path mapping
config.resolver.alias = {
  '@': './src',
  '@/components': './src/components',
  '@/hooks': './src/hooks',
  '@/services': './src/services',
  '@/types': './src/types',
  '@/utils': './src/utils',
};

module.exports = config;