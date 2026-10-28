const { existsSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
if (existsSync(join(root, 'app'))) throw new Error('Remove the duplicate frontend/app directory: it shadows frontend/src/app.');
if (existsSync(join(root, 'tsconfig.json'))) throw new Error('Use jsconfig.json. This project uses JavaScript and JSX only.');
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.tsx?$/.test(entry.name)) throw new Error(`Migrate application TypeScript to JavaScript/JSX: ${file}`);
  }
}
check(join(root, 'src'));
for (const filename of ['layout.jsx', 'page.jsx']) {
  if (!existsSync(join(root, 'src', 'app', filename))) throw new Error(`Missing App Router entry: ${filename}`);
}
