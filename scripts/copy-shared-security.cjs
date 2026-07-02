const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '../shared/security');
const target = path.resolve(process.cwd(), 'shared/security');

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`Copied shared/security -> ${target}`);
