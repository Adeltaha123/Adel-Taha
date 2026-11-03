const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Shared business logic lives one level above this independently installed app.
config.watchFolders = [path.resolve(__dirname, '../shared')];
config.maxWorkers = 1;
// NodeNext emits .js imports; Metro consumes the same shared files as TypeScript.
const sharedRoot = path.resolve(__dirname, '../shared') + path.sep;
config.resolver.resolveRequest = (context, name, platform) => {
  const source = context.originModulePath.startsWith(sharedRoot) && name.startsWith('.') && name.endsWith('.js') ? name.slice(0, -3) : name;
  return context.resolveRequest(context, source, platform);
};
module.exports = config;
