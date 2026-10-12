import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const windows = process.platform === 'win32';
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const configureOnly = args.includes('--configure-only');
const skipPrebuild = args.includes('--skip-prebuild');
const architectures = args.find((arg) => arg.startsWith('--architectures='))?.split('=')[1];
const supportedArchitectures = new Set(['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (args.some((arg) => !['--check', '--configure-only', '--skip-prebuild'].includes(arg) && !arg.startsWith('--architectures='))) {
  fail('Usage: node tools/build-android.mjs [--check] [--configure-only] [--skip-prebuild] [--architectures=arm64-v8a,x86_64]');
}
if (architectures !== undefined && architectures.split(',').some((abi) => !supportedArchitectures.has(abi))) {
  fail('Unsupported architecture. Choose armeabi-v7a, arm64-v8a, x86, or x86_64.');
}

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) {
  fail('Expo SDK 57 requires Node.js 22.13 or newer.');
}

const sdkCandidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  windows && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  process.platform === 'darwin' && path.join(homedir(), 'Library', 'Android', 'sdk'),
  path.join(homedir(), 'Android', 'Sdk'),
].filter(Boolean);
const sdk = sdkCandidates.find((candidate) => existsSync(path.join(candidate, 'platforms')));
if (!sdk) fail('Install the Android SDK in Android Studio, then set ANDROID_HOME to its directory.');

const javaCandidates = [
  process.env.JAVA_HOME,
  windows && process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Android', 'Android Studio', 'jbr'),
  process.platform === 'darwin' && '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  '/opt/android-studio/jbr',
].filter(Boolean);
const javaHome = javaCandidates.find((candidate) => existsSync(path.join(candidate, 'bin', windows ? 'java.exe' : 'java')));
const javaCommand = javaHome ? path.join(javaHome, 'bin', windows ? 'java.exe' : 'java') : 'java';
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  // Android releases must use real session timings, even after a web test build.
  EXPO_PUBLIC_TEST_TIMINGS: '0',
  // The user's Command Processor AutoRun checks this flag so build child
  // processes keep their working directory. Normal command prompts keep theirs.
  DEEP_BREATHER_BUILD: '1',
  NODE_ENV: 'production',
  CI: '1',
};

const java = spawnSync(javaCommand, ['-version'], { env, encoding: 'utf8' });
if (java.error || java.status !== 0) fail('A working JDK is required. Set JAVA_HOME to your Android Studio jbr directory.');
console.log(`Node: ${process.versions.node}`);
console.log(`Android SDK: ${sdk}`);
console.log((java.stderr || java.stdout).trim());
console.log('Local APKs use the generated debug signing key and are for personal testing.');
if (checkOnly) process.exit(0);

function run(command, commandArgs, cwd, shell = false) {
  const result = spawnSync(command, commandArgs, { cwd, env, stdio: 'inherit', shell });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

// Regenerate configuration and assets without deleting the native project.
if (!skipPrebuild) {
  run(process.execPath, [path.join(root, 'node_modules', 'expo', 'bin', 'cli'), 'prebuild', '--platform', 'android', '--no-install'], root);
}
if (!existsSync(path.join(android, windows ? 'gradlew.bat' : 'gradlew'))) {
  fail('The native Android project is missing. Run again without --skip-prebuild.');
}
// cmd.exe is needed only for the checked-in Gradle batch launcher on Windows.
// Its command name is constant; the optional architecture list is validated above.
run(windows ? 'gradlew.bat' : './gradlew', [
  configureOnly ? 'help' : ':app:assembleRelease', '--project-dir', windows ? `"${android}"` : android, '--no-daemon', '--console=plain', '--max-workers=2',
  ...(architectures ? [`-PreactNativeArchitectures=${architectures}`] : []),
], android, windows);
if (configureOnly) process.exit(0);

const apk = path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apk)) fail(`Gradle completed but the expected APK was not found: ${apk}`);
console.log(`\nInstallable personal-testing APK: ${apk}`);
console.log('The JavaScript and audio are bundled; Metro is not needed on the phone.');
