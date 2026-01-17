#!/usr/bin/env bun
/**
 * AniSeekr Development Sync Script
 *
 * This script handles:
 * 1. Android build and installation with troubleshooting
 * 2. Data synchronization from AniList and other platforms
 * 3. Verification of iOS UI parity
 *
 * Usage:
 *   bun run sync.ts                    # Run full sync
 *   bun run sync.ts --android          # Build Android only
 *   bun run sync.ts --sync             # Sync data only
 *   bun run sync.ts --verify           # Verify UI parity
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const exec = promisify(require('child_process').exec);

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, COLORS.cyan + COLORS.bold);
  console.log('='.repeat(60) + '\n');
}

interface Args {
  android?: boolean;
  sync?: boolean;
  verify?: boolean;
  all?: boolean;
}

// Parse command line arguments
function parseArgs(): Args {
  const args: Args = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg === '--android' || arg === '-a') args.android = true;
    if (arg === '--sync' || arg === '-s') args.sync = true;
    if (arg === '--verify' || arg === '-v') args.verify = true;
    if (arg === '--all' || arg === '-a') args.all = true;
  });

  // Default to all if no args provided
  if (!args.android && !args.sync && !args.verify) {
    args.all = true;
  }

  return args;
}

/**
 * Android Build & Installation Section
 */
async function runAndroidBuild(): Promise<void> {
  logSection('Android Build & Installation');

  try {
    // Check if emulator is running
    log('Checking emulator status...', COLORS.yellow);
    const { stdout: devicesOutput } = await exec('adb devices');
    const hasDevice = devicesOutput.includes('device');

    if (!hasDevice) {
      log('No device found. Starting emulator...', COLORS.yellow);

      // List available emulators
      const { stdout: avds } = await exec('emulator -list-avds');
      const emulatorName = avds.split('\n')[0].trim();

      if (emulatorName) {
        log(`Starting emulator: ${emulatorName}`, COLORS.yellow);
        spawn('emulator', ['-avd', emulatorName, '-no-window'], {
          detached: true,
          stdio: 'ignore',
        });

        // Wait for boot
        log('Waiting for emulator to boot (30s)...', COLORS.yellow);
        await new Promise((resolve) => setTimeout(resolve, 30000));
      } else {
        log('No emulators found. Please create one first.', COLORS.red);
        return;
      }
    } else {
      log('✓ Emulator already running', COLORS.green);
    }

    // Check for existing installation
    log('Checking for existing installation...', COLORS.yellow);
    try {
      const { stdout: packages } = await exec('adb shell pm list packages | grep aniseekr');
      if (packages.includes('com.kidneyweakx.aniseekr')) {
        log('App already installed. Uninstalling to fix signature mismatch...', COLORS.yellow);
        await exec('adb uninstall com.kidneyweakx.aniseekr');
        log('✓ App uninstalled', COLORS.green);
      }
    } catch (e) {
      // App not installed, continue
    }

    // Run Android build
    log('Running Android build...', COLORS.yellow);
    const { stdout: buildOutput, stderr: buildError } = await exec('bun run android', {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000,
    });

    if (buildOutput.includes('BUILD SUCCESSFUL')) {
      log('✓ Android build successful!', COLORS.green);
    } else if (
      buildOutput.includes('BUILD FAILED') ||
      (buildError && buildError.includes('BUILD FAILED'))
    ) {
      log('✗ Android build failed', COLORS.red);
      log('Check android/build/reports/problems/problems-report.html', COLORS.yellow);
    } else {
      log('Build completed with warnings. Check output above.', COLORS.yellow);
    }
  } catch (error: any) {
    log(`✗ Error: ${error.message}`, COLORS.red);
    log('Try running: cd android && ./gradlew clean', COLORS.yellow);
  }
}

/**
 * Data Synchronization Section
 */
async function runDataSync(): Promise<void> {
  logSection('Data Synchronization');

  try {
    // Import the sync service
    const { platformSyncService } = await import('./libs/services/platform-sync-service');

    log('Syncing data from AniList...', COLORS.yellow);

    // Get sync status before
    const beforeStatus = platformSyncService.getAllSyncStatuses();
    log('Sync status before:', COLORS.cyan);
    beforeStatus.forEach((status) => {
      console.log(`  ${status.platform}: ${status.status}`);
    });

    // Sync AniList
    const animeItems = await platformSyncService.syncAniList();
    log(`✓ Synced ${animeItems.length} anime items from AniList`, COLORS.green);

    // Get profile
    const profile = await platformSyncService.getAniListProfile();
    if (profile) {
      log(`✓ Profile: ${profile.username}`, COLORS.green);
      log(`  - Total anime: ${profile.stats.totalAnime}`, COLORS.cyan);
      log(`  - Episodes watched: ${profile.stats.episodesWatched}`, COLORS.cyan);
      log(`  - Mean score: ${profile.stats.meanScore.toFixed(1)}`, COLORS.cyan);
    } else {
      log('Could not fetch profile (may need authentication)', COLORS.yellow);
    }

    // Get sync status after
    const afterStatus = platformSyncService.getAllSyncStatuses();
    log('\nSync status after:', COLORS.cyan);
    afterStatus.forEach((status) => {
      const lastSync = status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'never';
      console.log(`  ${status.platform}: ${status.status} (last: ${lastSync})`);
    });
  } catch (error: any) {
    log(`✗ Sync error: ${error.message}`, COLORS.red);
    log('Make sure you have an internet connection.', COLORS.yellow);
  }
}

/**
 * UI Parity Verification Section
 */
async function runUIVerification(): Promise<void> {
  logSection('iOS UI Parity Verification');

  const projectRoot = process.cwd();
  const componentsDir = path.join(projectRoot, 'components');
  const appDir = path.join(projectRoot, 'app');

  // Check if files exist
  const checkFiles = async (files: string[]) => {
    const missing: string[] = [];
    for (const file of files) {
      const exists = await fileExists(path.join(projectRoot, file));
      if (!exists) {
        missing.push(file);
      }
    }
    return missing;
  };

  // Check component parity
  log('Checking core components...', COLORS.yellow);

  const coreComponents = [
    'components/profile/ProfileHeader.tsx',
    'components/profile/StatsGrid.tsx',
    'components/profile/EditProfileSheet.tsx',
    'components/gacha/GachaUI.tsx',
    'components/gacha/CardPackOpening.tsx',
    'components/achievements/Achievements.tsx',
    'components/common/AnimatedPressable.tsx',
  ];

  const missingComponents = await checkFiles(coreComponents);
  if (missingComponents.length > 0) {
    log(`✗ Missing components: ${missingComponents.join(', ')}`, COLORS.red);
  } else {
    log('✓ All core components present', COLORS.green);
  }

  // Check app screens
  log('Checking app screens...', COLORS.yellow);

  const appScreens = [
    'app/profile.tsx',
    'app/gacha.tsx',
    'app/collection.tsx',
    'app/(rate)/index.tsx',
    'app/(setting)/settings.tsx',
  ];

  const missingScreens = await checkFiles(appScreens);
  if (missingScreens.length > 0) {
    log(`✗ Missing screens: ${missingScreens.join(', ')}`, COLORS.red);
  } else {
    log('✓ All app screens present', COLORS.green);
  }

  // Check for iOS-specific patterns
  log('Checking iOS patterns...', COLORS.yellow);
  const iosPatterns = [
    { pattern: 'SafeAreaView', file: 'app/_layout.tsx' },
    { pattern: 'HapticFeedback', file: 'components/common/AnimatedPressable.tsx' },
    { pattern: 'Modal', file: 'app/gacha.tsx' },
    { pattern: 'RefreshControl', file: 'app/profile.tsx' },
  ];

  let allPatternsFound = true;
  for (const { pattern, file } of iosPatterns) {
    try {
      const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
      if (!content.includes(pattern)) {
        log(`✗ Missing ${pattern} in ${file}`, COLORS.red);
        allPatternsFound = false;
      }
    } catch {
      log(`✗ File not found: ${file}`, COLORS.red);
      allPatternsFound = false;
    }
  }

  if (allPatternsFound) {
    log('✓ iOS patterns verified', COLORS.green);
  }

  // Summary
  log('\n📊 UI Parity Summary:', COLORS.cyan + COLORS.bold);
  console.log(
    `  - Components: ${missingComponents.length === 0 ? '✓' : '⚠'} ${coreComponents.length - missingComponents.length}/${coreComponents.length}`
  );
  console.log(
    `  - Screens: ${missingScreens.length === 0 ? '✓' : '⚠'} ${appScreens.length - missingScreens.length}/${appScreens.length}`
  );
  console.log(`  - iOS Patterns: ${allPatternsFound ? '✓' : '⚠'}`);

  const score =
    (((missingComponents.length === 0 ? 1 : 0) +
      (missingScreens.length === 0 ? 1 : 0) +
      (allPatternsFound ? 1 : 0)) /
      3) *
    100;

  console.log(`\n  Estimated iOS Parity: ${score.toFixed(0)}%`);

  if (score >= 90) {
    log('✓ UI Parity target met (90%+)', COLORS.green);
  } else {
    log(`⚠ UI Parity below target (${score.toFixed(0)}% < 90%)`, COLORS.yellow);
    log('  Missing components need to be implemented.', COLORS.yellow);
  }
}

// Helper function to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  log('AniSeekr Development Sync', COLORS.cyan + COLORS.bold);
  console.log('='.repeat(60));

  const args = parseArgs();

  if (args.all || args.android) {
    await runAndroidBuild();
  }

  if (args.all || args.sync) {
    await runDataSync();
  }

  if (args.all || args.verify) {
    await runUIVerification();
  }

  logSection('Sync Complete');
  console.log('Next steps:');
  console.log('  - Run `bun run android` to test on device/emulator');
  console.log('  - Run `bun run sync --sync` to refresh data');
  console.log('  - Run `bun run sync --verify` to check UI parity');
}

// Run main function
main().catch(console.error);
