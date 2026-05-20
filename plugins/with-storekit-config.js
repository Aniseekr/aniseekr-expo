/* eslint-env node */
const { withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Copies the pinned StoreKit configuration from infra/storekit/Products.storekit
 * into the prebuilt ios/<project>/ directory so Xcode can pick it up via
 * Scheme → Run → Options → StoreKit Configuration for local IAP testing.
 *
 * Source of truth lives at infra/storekit/Products.storekit; ios/ is gitignored
 * Expo prebuild output, so without this plugin the file would be lost on every
 * `expo prebuild --clean`.
 */
const withStorekitConfig = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const source = path.join(
        modConfig.modRequest.projectRoot,
        'infra',
        'storekit',
        'Products.storekit'
      );

      if (!fs.existsSync(source)) {
        return modConfig;
      }

      const projectName = IOSConfig.XcodeUtils.getProjectName(
        modConfig.modRequest.projectRoot
      );
      const destDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        projectName
      );

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(source, path.join(destDir, 'Products.storekit'));
      return modConfig;
    },
  ]);
};

module.exports = withStorekitConfig;
