/**
 * Android Build Review Agent
 *
 * This agent helps with Android build troubleshooting, installation issues,
 * and provides recommendations for common problems.
 *
 * Usage:
 * - Run `bun run android` to build and install the app
 * - If build fails, this agent will analyze the error and provide solutions
 * - If installation fails with signature mismatch, use `adb uninstall` first
 *
 * Common Issues & Solutions:
 *
 * 1. INSTALL_FAILED_UPDATE_INCOMPATIBLE
 *    Cause: App installed with different signature
 *    Solution: `adb uninstall com.kidneyweakx.aniseekr`
 *
 * 2. Port conflicts
 *    Cause: Another app using port 8081
 *    Solution: Expo will prompt to use another port
 *
 * 3. Gradle build failures
 *    Cause: Dependency issues or Kotlin version mismatch
 *    Solution: Check `android/build/reports/problems/problems-report.html`
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const exec = promisify(require('child_process').exec);

interface BuildResult {
  success: boolean;
  output: string;
  error?: string;
  suggestions?: string[];
}

interface AndroidIssue {
  pattern: RegExp;
  solution: string;
  severity: 'high' | 'medium' | 'low';
}

class AndroidReviewAgent {
  private projectRoot: string;
  private buildReportPath: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.buildReportPath = path.join(
      this.projectRoot,
      'android/build/reports/problems/problems-report.html'
    );
  }

  /**
   * Analyze Android build issues from error output
   */
  async analyzeBuildOutput(output: string): Promise<string[]> {
    const suggestions: string[] = [];
    const issues: AndroidIssue[] = [
      {
        pattern: /INSTALL_FAILED_UPDATE_INCOMPATIBLE/,
        solution: 'Run: adb uninstall com.kidneyweakx.aniseekr',
        severity: 'high',
      },
      {
        pattern: /INSTALL_FAILED_VERSION_DOWNGRADE/,
        solution: 'Run: adb uninstall com.kidneyweakx.aniseekr or use -r flag',
        severity: 'high',
      },
      {
        pattern: /Could not find or load main class.*kotlin/,
        solution: 'Check Kotlin version in android/build.gradle and android/app/build.gradle',
        severity: 'high',
      },
      {
        pattern: /Gradle.*Daemon.*died/,
        solution: 'Run: cd android && ./gradlew --stop',
        severity: 'medium',
      },
      {
        pattern: /Execution failed for task.*:app:mergeExtDexDebug/,
        solution: 'Clean build: cd android && ./gradlew clean',
        severity: 'high',
      },
      {
        pattern: /Property.*annotation.*not supported/,
        solution: 'Check annotation processor configuration in build.gradle',
        severity: 'medium',
      },
      {
        pattern: /null cannot be cast to non-null type/,
        solution: 'Check Kotlin null safety configuration',
        severity: 'medium',
      },
    ];

    for (const issue of issues) {
      if (issue.pattern.test(output)) {
        suggestions.push(`[${issue.severity.toUpperCase()}] ${issue.solution}`);
      }
    }

    return suggestions;
  }

  /**
   * Check if emulator is running
   */
  async checkEmulator(): Promise<{ running: boolean; devices: string[] }> {
    try {
      const { stdout } = await exec('adb devices');
      const devices = stdout
        .split('\n')
        .slice(1)
        .filter((line) => line.trim() && !line.includes('List of devices'))
        .map((line) => line.split('\t')[0].trim());

      return {
        running: devices.length > 0,
        devices,
      };
    } catch (error) {
      return { running: false, devices: [] };
    }
  }

  /**
   * Start emulator if not running
   */
  async startEmulator(
    emulatorName: string = 'Pixel_3a_API_34_extension_level_7_arm64-v8a'
  ): Promise<boolean> {
    try {
      const { running } = await this.checkEmulator();
      if (running) {
        console.log('✓ Emulator already running');
        return true;
      }

      console.log(`Starting emulator: ${emulatorName}`);
      const { stdout } = await exec(`emulator -list-avds`);

      if (!stdout.includes(emulatorName)) {
        console.error(`Emulator ${emulatorName} not found`);
        return false;
      }

      // Start in background
      spawn('emulator', ['-avd', emulatorName, '-no-window'], {
        detached: true,
        stdio: 'ignore',
      });

      // Wait for boot
      console.log('Waiting for emulator to boot...');
      await new Promise((resolve) => setTimeout(resolve, 30000));

      return true;
    } catch (error) {
      console.error('Failed to start emulator:', error);
      return false;
    }
  }

  /**
   * Uninstall app to fix signature issues
   */
  async uninstallApp(packageName: string = 'com.kidneyweakx.aniseekr'): Promise<boolean> {
    try {
      const { devices } = await this.checkEmulator();
      if (devices.length === 0) {
        console.error('No emulator/device found');
        return false;
      }

      for (const device of devices) {
        console.log(`Uninstalling from ${device}...`);
        await exec(`adb -s ${device} uninstall ${packageName}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to uninstall app:', error);
      return false;
    }
  }

  /**
   * Run Android build
   */
  async runBuild(): Promise<BuildResult> {
    try {
      console.log('Running Android build...');
      const { stdout, stderr } = await exec('bun run android', {
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 300000, // 5 minutes
      });

      const output = stdout + stderr;
      const suggestions = await this.analyzeBuildOutput(output);

      return {
        success: output.includes('BUILD SUCCESSFUL'),
        output,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
    } catch (error: any) {
      const output = error.stdout || error.message;
      const suggestions = await this.analyzeBuildOutput(output);

      return {
        success: false,
        output,
        error: error.message,
        suggestions:
          suggestions.length > 0
            ? suggestions
            : ['Check the build output for specific error messages'],
      };
    }
  }

  /**
   * Check build report for issues
   */
  async checkBuildReport(): Promise<string[]> {
    try {
      const content = await fs.readFile(this.buildReportPath, 'utf-8');
      const issues: string[] = [];

      // Look for common patterns in the HTML report
      const problemPatterns = [/<h3>(.*?)<\/h3>/g, /<td class="message">(.*?)<\/td>/g];

      for (const pattern of problemPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          issues.push(...matches.map((m) => m.replace(/<[^>]*>/g, '').trim()));
        }
      }

      return issues;
    } catch (error) {
      return ['Could not read build report'];
    }
  }

  /**
   * Run full diagnostics
   */
  async runDiagnostics(): Promise<void> {
    console.log('=== Android Build Review Agent ===\n');

    // Check emulator
    console.log('1. Checking emulator status...');
    const { running: emulatorRunning, devices } = await this.checkEmulator();
    console.log(`   Emulator running: ${emulatorRunning ? 'Yes' : 'No'}`);
    if (devices.length > 0) {
      console.log(`   Devices: ${devices.join(', ')}`);
    }

    // Check for build report
    console.log('\n2. Checking build report...');
    const reportIssues = await this.checkBuildReport();
    if (reportIssues.length > 0) {
      console.log('   Issues found:');
      reportIssues.forEach((issue) => console.log(`   - ${issue}`));
    } else {
      console.log('   No issues found in build report');
    }

    // Provide recommendations
    console.log('\n3. Recommendations:');
    console.log('   - Run `bun run android` to build and install');
    console.log('   - If signature mismatch: Run `adb uninstall com.kidneyweakx.aniseekr`');
    console.log('   - If build fails: Check android/build/reports/problems/problems-report.html');
    console.log('   - For port conflicts: Expo will prompt to use another port');

    console.log('\n=== End of Diagnostics ===\n');
  }
}

// Export for use in scripts
export { AndroidReviewAgent };

// Run diagnostics if called directly
if (require.main === module) {
  const agent = new AndroidReviewAgent();
  agent.runDiagnostics().catch(console.error);
}
