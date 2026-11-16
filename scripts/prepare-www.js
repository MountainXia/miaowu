const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW_DIR = path.join(ROOT, 'www');

const INCLUDE_FILES = [
  'index.html',
  'db.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

const INCLUDE_DIRS = [
  'components',
  'icons',
  'assets',
  'vendor',
  'public'
];

if (fs.existsSync(WWW_DIR)) {
  fs.rmSync(WWW_DIR, { recursive: true, force: true });
}
fs.mkdirSync(WWW_DIR, { recursive: true });

for (const file of INCLUDE_FILES) {
  const src = path.join(ROOT, file);
  const dest = path.join(WWW_DIR, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

for (const dir of INCLUDE_DIRS) {
  const src = path.join(ROOT, dir);
  const dest = path.join(WWW_DIR, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
  }
}

console.log('[prepare-www] Successfully built www/ directory.');
