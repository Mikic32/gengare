const fs = require('fs');
const path = require('path');

const settingsGradlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native',
  'gradle-plugin',
  'settings.gradle.kts'
);

if (!fs.existsSync(settingsGradlePath)) {
  process.exit(0);
}

const original = fs.readFileSync(settingsGradlePath, 'utf8');
const updated = original.replace(
  'id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")',
  'id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")'
);

if (updated !== original) {
  fs.writeFileSync(settingsGradlePath, updated);
  console.log('Patched @react-native/gradle-plugin foojay resolver to 1.0.0');
}
