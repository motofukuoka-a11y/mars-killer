import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
const normalize = value => value.replace(/^\.\//, '').split(/[?#]/)[0];

const required = [
  'index.html','app.js','engine.js','service-worker.js','manifest.webmanifest',
  'ui/Version6RefundPanel.js','ui/Version6RefundController.js',
  'services/v6/Version6Platform.js','validation/ValidationEngineV6.js',
  'engines/v6/BusinessEngineV6.js','data/rules/refund_rules_v6.json',
  'data/rules/accident_rules_v6.json'
];

const html = read('index.html');
const htmlRefs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
  .map(match => normalize(match[1]))
  .filter(ref => ref && !/^(?:https?:|data:|#)/.test(ref));

const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|mjs)$/.test(entry.name)) jsFiles.push(full);
  }
}
walk(root);

const importRefs = [];
for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const relativeFile = path.relative(root, file).replaceAll(path.sep, '/');
  for (const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const target = path.normalize(path.resolve(path.dirname(file), specifier));
    importRefs.push({
      from: relativeFile,
      target: path.relative(root, target).replaceAll(path.sep, '/'),
      exists: fs.existsSync(target)
    });
  }
}

const sw = read('service-worker.js');
const criticalBlock = sw.match(/const CRITICAL_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
const optionalBlock = sw.match(/const OPTIONAL_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
const extractQuoted = block => [...block.matchAll(/["']([^"']+)["']/g)].map(m => normalize(m[1])).filter(Boolean);
const criticalAssets = extractQuoted(criticalBlock).filter(asset => asset !== './' && asset !== '');
const optionalAssets = extractQuoted(optionalBlock);

const manifest = JSON.parse(read('manifest.webmanifest'));
const manifestIconRefs = (manifest.icons ?? []).map(icon => normalize(icon.src));

const report = {
  generated_at: new Date().toISOString(),
  scope: 'Version 5.1 changed-files overlay plus Version 6 cumulative implementation',
  checks: {
    required_files: required.map(file => ({ file, exists: exists(file) })),
    html_references: htmlRefs.map(file => ({ file, exists: exists(file) })),
    module_imports: importRefs,
    service_worker_critical_assets: criticalAssets.map(file => ({ file, exists: exists(file) })),
    service_worker_optional_assets: optionalAssets.map(file => ({ file, exists: exists(file) })),
    manifest_icons: manifestIconRefs.map(file => ({ file, exists: exists(file) })),
    manifest_fields: {
      name: Boolean(manifest.name),
      short_name: Boolean(manifest.short_name),
      start_url: Boolean(manifest.start_url),
      display: Boolean(manifest.display)
    },
    ui_tokens: {
      version6_panel_script: html.includes('./ui/Version6RefundPanel.js'),
      version6_mount: /__MARS_KILLER_V6_CONTROLLER__/.test(read('ui/Version6RefundPanel.js')),
      service_worker_registration: /service-worker\.js/.test(html) || /service-worker\.js/.test(read('app.js'))
    }
  }
};

const missingRequired = report.checks.required_files.filter(x => !x.exists);
const missingImports = report.checks.module_imports.filter(x => !x.exists);
const missingCritical = report.checks.service_worker_critical_assets.filter(x => !x.exists);
const missingHtml = report.checks.html_references.filter(x => !x.exists);
const missingIcons = report.checks.manifest_icons.filter(x => !x.exists);
const missingOptional = report.checks.service_worker_optional_assets.filter(x => !x.exists);

report.summary = {
  required_missing: missingRequired.length,
  module_imports_missing: missingImports.length,
  critical_assets_missing: missingCritical.length,
  html_references_missing: missingHtml.length,
  manifest_icons_missing: missingIcons.length,
  optional_assets_missing: missingOptional.length,
  overlay_internal_gate_passed: missingRequired.length === 0 && missingCritical.length === 0,
  full_application_release_ready: false,
  release_blockers: [
    ...(missingImports.length ? ['Runtime module imports are missing from this overlay.'] : []),
    ...(missingHtml.length ? ['HTML-referenced assets are missing from this overlay.'] : []),
    ...(missingIcons.length ? ['Manifest icons are missing from this overlay.'] : []),
    'The complete historical repository has not been provided.',
    'Browser, installability, and offline behavior have not been verified in a real browser.'
  ]
};

fs.writeFileSync(path.join(root, 'STAGE7_PREFLIGHT.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));

if (!report.summary.overlay_internal_gate_passed) process.exitCode = 1;
