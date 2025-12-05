/* eslint-disable @typescript-eslint/no-var-requires */
const { withAndroidManifest, withDangerousMod, withMainApplication, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MODULE_NAME = "AniseekrVibration";

function addVibratePermission(androidManifest) {
  const permission = "android.permission.VIBRATE";
  const existing = androidManifest.manifest["uses-permission"] || [];
  if (!existing.some((item) => item.$["android:name"] === permission)) {
    existing.push({ $: { "android:name": permission } });
    androidManifest.manifest["uses-permission"] = existing;
  }
  return androidManifest;
}

function loadTemplate(templateName, replacements) {
  const templatePath = path.join(__dirname, "templates", templateName);
  let content = fs.readFileSync(templatePath, "utf8");
  
  Object.keys(replacements).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, "g");
    content = content.replace(regex, replacements[key]);
  });
  
  return content;
}

const withVibrationBridge = (config) => {
  config = withAndroidManifest(config, (config) => {
    config.modResults = addVibratePermission(config.modResults);
    return config;
  });

  const pkg = AndroidConfig.Package.getPackage(config) || "com.aniseekrexpo";
  const pkgPath = pkg.replace(/\./g, "/");

  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const moduleDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "java", pkgPath, "vibration");
      fs.mkdirSync(moduleDir, { recursive: true });
      
      const replacements = {
        PACKAGE_NAME: pkg,
        MODULE_NAME: MODULE_NAME,
      };
      
      const moduleContent = loadTemplate("AniseekrVibrationModule.kt.template", replacements);
      const packageContent = loadTemplate("AniseekrVibrationPackage.kt.template", replacements);
      
      fs.writeFileSync(path.join(moduleDir, `${MODULE_NAME}Module.kt`), moduleContent);
      fs.writeFileSync(path.join(moduleDir, `${MODULE_NAME}Package.kt`), packageContent);
      return config;
    },
  ]);

  config = withMainApplication(config, (config) => {
    const { language, path: appPath } = config.modResults;
    if (language !== "java" && language !== "kt") {
      return config;
    }
    const importLine = `import ${pkg}.vibration.${MODULE_NAME}Package;`;
    if (!config.modResults.contents.includes(importLine)) {
      config.modResults.contents = importLine + "\n" + config.modResults.contents;
    }
    const addPackageSnippet = "packages.add(new " + MODULE_NAME + "Package());";
    if (!config.modResults.contents.includes(addPackageSnippet)) {
      config.modResults.contents = config.modResults.contents.replace(
        /return packages;/,
        `${addPackageSnippet}\n    return packages;`
      );
    }
    return config;
  });

  return config;
};

module.exports = withVibrationBridge;

