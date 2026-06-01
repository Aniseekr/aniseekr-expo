/* eslint-env node */
/* global __dirname */
//
// Installs the AniseekrSubjectLifter native module on `expo prebuild`:
//
//   iOS  — copies AniseekrSubjectLifter.swift / .m from plugins/templates/ into
//          ios/<proj>/SubjectLifter/ and registers them with the Xcode project.
//          Vision + CoreImage are system frameworks; no entitlement needed.
//   Android — copies the Kotlin module + package into
//          android/app/src/main/java/<pkg>/subjectlifter/, registers the
//          package in MainApplication, and adds the ML Kit Subject Segmentation
//          dependency to app/build.gradle.
//
// Mirrors plugins/with-cloudkit-bridge.js (iOS) and
// plugins/with-vibration-bridge.js (Android).
//
const {
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  withXcodeProject,
  AndroidConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_NAME = 'AniseekrSubjectLifter.swift';
const OBJC_NAME = 'AniseekrSubjectLifter.m';
const IOS_SUBDIR = 'SubjectLifter';
const MODULE_NAME = 'AniseekrSubjectLifter';
const ANDROID_SUBDIR = 'subjectlifter';
const MLKIT_DEP = 'com.google.android.gms:play-services-mlkit-subject-segmentation:16.0.0-beta1';

function loadTemplate(name, replacements = {}) {
  const templatePath = path.join(__dirname, 'templates', name);
  let content = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return content;
}

// ── iOS ────────────────────────────────────────────────────────────────────

function withIos(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectName = cfg.modRequest.projectName || 'AniSeekr';
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, projectName, IOS_SUBDIR);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, SWIFT_NAME), loadTemplate(SWIFT_NAME));
      fs.writeFileSync(path.join(targetDir, OBJC_NAME), loadTemplate(OBJC_NAME));
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName || 'AniSeekr';
    const groupKey = ensureGroupUnderParent(project, projectName, IOS_SUBDIR);
    for (const fileName of [SWIFT_NAME, OBJC_NAME]) {
      if (!fileAlreadyInProject(project, fileName)) {
        project.addSourceFile(fileName, { target: project.getFirstTarget().uuid }, groupKey);
      }
    }
    return cfg;
  });

  return config;
}

// Creates (or finds) a PBXGroup named `childName` directly under `parentName`.
// Mirrors with-cloudkit-bridge.js so the files land in ios/<proj>/SubjectLifter/.
function ensureGroupUnderParent(project, parentName, childName) {
  const parentKey =
    project.findPBXGroupKey({ name: parentName }) ||
    project.getFirstProject().firstProject.mainGroup;

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

// ── Android ──────────────────────────────────────────────────────────────────

function withAndroid(config) {
  const pkg = AndroidConfig.Package.getPackage(config) || 'com.aniseekrexpo';
  const pkgPath = pkg.replace(/\./g, '/');

  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const moduleDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        pkgPath,
        ANDROID_SUBDIR
      );
      fs.mkdirSync(moduleDir, { recursive: true });
      const replacements = { PACKAGE_NAME: pkg, MODULE_NAME };
      fs.writeFileSync(
        path.join(moduleDir, `${MODULE_NAME}Module.kt`),
        loadTemplate('AniseekrSubjectLifterModule.kt.template', replacements)
      );
      fs.writeFileSync(
        path.join(moduleDir, `${MODULE_NAME}Package.kt`),
        loadTemplate('AniseekrSubjectLifterPackage.kt.template', replacements)
      );
      return cfg;
    },
  ]);

  config = withMainApplication(config, (cfg) => {
    const { language } = cfg.modResults;
    if (language !== 'java' && language !== 'kt') return cfg;
    const importLine = `import ${pkg}.${ANDROID_SUBDIR}.${MODULE_NAME}Package`;
    if (!cfg.modResults.contents.includes(importLine)) {
      const match = cfg.modResults.contents.match(/package\s+[\w.]+;?/);
      if (match) {
        const end = match.index + match[0].length;
        cfg.modResults.contents =
          cfg.modResults.contents.slice(0, end) +
          '\n\n' +
          importLine +
          cfg.modResults.contents.slice(end);
      } else {
        cfg.modResults.contents = importLine + '\n' + cfg.modResults.contents;
      }
    }
    const addCall = `add(${MODULE_NAME}Package())`;
    if (!cfg.modResults.contents.includes(addCall)) {
      // Expo SDK 54's Kotlin MainApplication uses the expression-body
      //   PackageList(this).packages.apply { … }
      // form, so inject the registration as the first statement of that block.
      const applyAnchor = 'PackageList(this).packages.apply {';
      if (cfg.modResults.contents.includes(applyAnchor)) {
        cfg.modResults.contents = cfg.modResults.contents.replace(
          applyAnchor,
          `${applyAnchor}\n              ${addCall}`
        );
      } else {
        // Fallback for the older `return packages` template shape.
        cfg.modResults.contents = cfg.modResults.contents.replace(
          /return packages/,
          `packages.${addCall}\n            return packages`
        );
      }
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes(MLKIT_DEP)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {\n    implementation("${MLKIT_DEP}")`
    );
    return cfg;
  });

  return config;
}

const withSubjectLifter = (config) => {
  config = withIos(config);
  config = withAndroid(config);
  return config;
};

module.exports = withSubjectLifter;
