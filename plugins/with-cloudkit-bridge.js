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
    const groupKey = ensureGroupUnderParent(project, projectName, SUBDIR);

    const sources = [SWIFT_NAME, OBJC_NAME];
    for (const fileName of sources) {
      // fileName only (not SUBDIR/fileName) — the group already carries the
      // CloudKitBridge path, so prepending it again produces a double segment
      // and Xcode looks in ios/CloudKitBridge/CloudKitBridge/…
      if (!fileAlreadyInProject(project, fileName)) {
        project.addSourceFile(fileName, { target: project.getFirstTarget().uuid }, groupKey);
      }
    }
    return cfg;
  });

  return config;
};

// Creates (or finds) a PBXGroup named `childName` as a direct child of the
// group named `parentName`.  Returns the child group's UUID.
// Using a scoped child search avoids the global findPBXGroupKey fallback that
// was silently re-parenting the group under mainGroup when AniSeekr wasn't
// found by name, which produced ios/CloudKitBridge/… instead of ios/AniSeekr/CloudKitBridge/…
function ensureGroupUnderParent(project, parentName, childName) {
  const parentKey =
    project.findPBXGroupKey({ name: parentName }) ||
    project.getFirstProject().firstProject.mainGroup;

  // Search children of parentKey for an existing group with childName
  const allGroups = project.hash.project.objects['PBXGroup'] || {};
  const parentGroup = allGroups[parentKey];
  if (parentGroup && Array.isArray(parentGroup.children)) {
    for (const child of parentGroup.children) {
      const childGroup = allGroups[child.value];
      if (
        childGroup &&
        (childGroup.name === childName ||
          childGroup.name === `"${childName}"` ||
          childGroup.path === childName ||
          childGroup.path === `"${childName}"`)
      ) {
        return child.value;
      }
    }
  }

  // path must carry the parent prefix (e.g. "AniSeekr/CloudKitBridge"): the
  // "AniSeekr" group is a name-only logical group with no path of its own, so
  // a bare "CloudKitBridge" path resolves to ios/CloudKitBridge/ instead of
  // ios/AniSeekr/CloudKitBridge/ where withDangerousMod actually writes the
  // files. Mirrors the sibling "Supporting" group (path = AniSeekr/Supporting).
  const newGroup = project.addPbxGroup([], childName, `${parentName}/${childName}`);
  project.addToPbxGroup(newGroup.uuid, parentKey);
  return newGroup.uuid;
}

function fileAlreadyInProject(project, fileName) {
  const fileRefs = project.pbxFileReferenceSection();
  return Object.values(fileRefs).some((ref) => {
    if (typeof ref !== 'object' || !ref) return false;
    const p = ref.path;
    return typeof p === 'string' && p.replace(/^"|"$/g, '') === fileName;
  });
}

module.exports = withCloudKitBridge;
