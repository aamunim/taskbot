// Dynamic part of the Expo config. app.json holds everything else.
//
// The over-the-air update settings in app.json belong to the original author's
// Expo project. A copy of this repository built by someone else must never pull
// updates from that project (it would load the author's app code and point at the
// author's backend). So:
//   - with EXPO_PROJECT_ID and EXPO_OWNER set, the build uses that Expo project;
//   - otherwise, when built from someone else's GitHub account, updates are
//     switched off entirely and the app only changes when a new APK is installed.
module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PROJECT_ID;
  const owner = process.env.EXPO_OWNER;
  const builtBy = process.env.GITHUB_REPOSITORY_OWNER;

  if (projectId && owner) {
    return {
      ...config,
      owner,
      updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` },
      extra: { ...config.extra, eas: { ...(config.extra && config.extra.eas), projectId } },
    };
  }
  if (builtBy && builtBy !== config.owner) {
    const { owner: _owner, updates: _updates, ...rest } = config;
    const { eas: _eas, ...extra } = config.extra || {};
    return { ...rest, extra, updates: { enabled: false } };
  }
  return config;
};
