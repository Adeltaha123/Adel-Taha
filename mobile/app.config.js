// app.json holds the settings; this only adds the web base path, which differs by host.
// GitHub Pages serves the site from /<repository>, so its workflow sets EXPO_BASE_URL=/Adel-Taha.
module.exports = ({ config }) => process.env.EXPO_BASE_URL
  ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL } }
  : config;
