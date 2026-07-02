#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  assertBundleSafeFlatPage,
  findBundleEmbedIssues,
} = require('../../lib/bundle-vr-embed');

const root = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const flatHtmlPath = path.join(root, 'flat-pages', 'main', 'index.html');
const flatHtml = fs.readFileSync(flatHtmlPath, 'utf8');
const embeddedHtml =
  config.flatPages?.pages?.main?.files?.find((f) => f.id === 'index.html')?.content || '';

assertBundleSafeFlatPage(flatHtml, 'flat-pages/main/index.html');
assertBundleSafeFlatPage(embeddedHtml, 'config.json flatPages');

if (config.vrTourEmbed?.hostedUrl) {
  throw new Error('config.json vrTourEmbed.hostedUrl must be empty for playground bundles');
}

const required = ['config.json', 'index.html', 'script.js', 'style.css', 'videos', 'images'];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    throw new Error(`Missing required bundle path: ${rel}`);
  }
}

const issues = findBundleEmbedIssues(embeddedHtml);
if (issues.length) {
  throw new Error(`Bundle validation failed: ${issues.join('; ')}`);
}

console.log('Playground bundle validation passed (relative VR embed, no hosted URLs).');
