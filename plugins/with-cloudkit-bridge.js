/* eslint-env node */
/* global __dirname */
//
// Installs the AniseekrCloudKitBridge Swift module into the iOS project on
// `expo prebuild`. Mirrors the pattern of plugins/with-vibration-bridge.js
// (which handles Android Kotlin) but for iOS.
//
// What it does:
//   1. Copies AniseekrCloudKitBridge.swift / .m from plugins/templates/ into
//      ios/AniSeekr/CloudKitBridge/, substituting the iCloud container id.
//   2. Adds those files to the Xcode project (via @expo/config-plugins).
//   3. (No entitlements changes needed — react-native-cloud-storage's plugin
//      already grants the iCloud container + CloudDocuments capability.)
//   4. Updates the bridging-header so Swift sees the React Native classes.
//
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_NAME = 'AniseekrCloudKitBridge.swift';
const OBJC_NAME = 'AniseekrCloudKitBridge.m';
const SUBDIR = 'CloudKitBridge';

function loadTemplate(name, replacements) {
  const templatePath = path.join(__dirname, 'templates', name);
  let content = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return content;
}

function resolveContainerId(config, options) {
  if (options && typeof options.iCloudContainerIdentifier === 'string') {
    return options.iCloudContainerIdentifier;
  }
  const bundleId = config.ios && config.ios.bundleIdentifier;
  if (!bundleId) {
    throw new Error('with-cloudkit-bridge: ios.bundleIdentifier missing — set it in app.json');
  }
  return `iCloud.${bundleId}`;
}

const withCloudKitBridge = (config, options = {}) => {
  const containerId = resolveContainerId(config, options);

  // Step 1: write Swift + Obj-C sources into ios/AniSeekr/CloudKitBridge/.
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectName = cfg.modRequest.projectName || 'AniSeekr';
      const targetDir = path.join(
        cfg.modRequest.platformProjectRoot,
        projectName,
        SUBDIR
      );
      fs.mkdirSync(targetDir, { recursive: true });

      const swiftContent = loadTemplate(SWIFT_NAME, { ICLOUD_CONTAINER: containerId });
      const objcContent = loadTemplate(OBJC_NAME, { ICLOUD_CONTAINER: containerId });

      fs.writeFileSync(path.join(targetDir, SWIFT_NAME), swiftContent);
      fs.writeFileSync(path.join(targetDir, OBJC_NAME), objcContent);
      return cfg;
    },
  ]);

  // Step 2: register the new files with the Xcode project so they're compiled.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName || 'AniSeekr';
    const groupKey = ensureGroup(project, [projectName, SUBDIR]);

    const sources = [SWIFT_NAME, OBJC_NAME];
    for (const fileName of sources) {
      const relativePath = `${SUBDIR}/${fileName}`;
      if (!fileAlreadyInProject(project, relativePath)) {
        project.addSourceFile(relativePath, { target: project.getFirstTarget().uuid }, groupKey);
      }
    }
    return cfg;
  });

  return config;
};

function ensureGroup(project, pathSegments) {
  let parentKey = project.findPBXGroupKey({ name: pathSegments[0] }) || project.getFirstProject().firstProject.mainGroup;
  for (let i = 1; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    let existing = project.findPBXGroupKey({ name: segment });
    if (!existing) {
      const group = project.addPbxGroup([], segment, segment);
      project.addToPbxGroup(group.uuid, parentKey);
      existing = group.uuid;
    }
    parentKey = existing;
  }
  return parentKey;
}

function fileAlreadyInProject(project, relativePath) {
  const fileRefs = project.pbxFileReferenceSection();
  return Object.values(fileRefs).some((ref) => {
    if (typeof ref !== 'object' || !ref) return false;
    const p = ref.path;
    return typeof p === 'string' && p.replace(/^"|"$/g, '') === relativePath;
  });
}

module.exports = withCloudKitBridge;
