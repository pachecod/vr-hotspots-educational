#!/usr/bin/env node
/**
 * Embeds flat-pages/main/* into config.json flatPages so ZIP imports match on-disk files.
 * Run from this folder before packaging: node sync-flat-pages-into-config.js
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const configPath = path.join(root, 'config.json');
const pageDir = path.join(root, 'flat-pages', 'main');
const fileDefs = [
  { id: 'index.html', name: 'index.html', type: 'html' },
  { id: 'style.css', name: 'style.css', type: 'css' },
  { id: 'script.js', name: 'script.js', type: 'javascript' },
];

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const files = fileDefs.map((def) => ({
  ...def,
  content: fs.readFileSync(path.join(pageDir, def.name), 'utf8'),
}));

const manifest = JSON.parse(fs.readFileSync(path.join(pageDir, 'manifest.json'), 'utf8'));

config.name = config.name === 'newhouse60th' ? 'Newhouse 60th Anniversary Tour' : config.name;
config.currentScene = 'scene1';
config.flatPages = {
  version: '2.5',
  activePageId: 'main',
  pages: {
    main: {
      id: 'main',
      name: manifest.name || 'Newhouse 60th Landing Page',
      framework: 'html',
      files,
    },
  },
};

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log('Updated config.json flatPages from flat-pages/main/');
