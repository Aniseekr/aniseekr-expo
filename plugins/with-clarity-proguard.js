/* eslint-env node */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# Microsoft Clarity (managed by with-clarity-proguard)';
const RULES = `${MARKER}
-keep class com.microsoft.clarity.** { *; }
-dontwarn com.microsoft.clarity.**
`;

const withClarityProguard = (config) => {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const proguardPath = path.join(
        modConfig.modRequest.projectRoot,
        'android',
        'app',
        'proguard-rules.pro'
      );

      if (!fs.existsSync(proguardPath)) {
        return modConfig;
      }

      const current = fs.readFileSync(proguardPath, 'utf8');
      if (current.includes(MARKER)) {
        return modConfig;
      }

      const next = current.endsWith('\n')
        ? `${current}\n${RULES}`
        : `${current}\n\n${RULES}`;
      fs.writeFileSync(proguardPath, next);
      return modConfig;
    },
  ]);
};

module.exports = withClarityProguard;
