import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const index = args.indexOf('--target');
if (index < 0 || !args[index + 1]) {
  console.error('Usage: node tools/verify-version6-integration.mjs --target <repository>');
  process.exit(2);
}
const target = path.resolve(args[index + 1]);
const localRoot = path.resolve(new URL('..', import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(localRoot, 'VERSION6_OVERLAY_MANIFEST.json'), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const overlayFiles = manifest.files.map(entry => {
  const file = path.join(target, entry.path);
  return {path:entry.path, exists:fs.existsSync(file), hash_match:fs.existsSync(file) && hash(file) === entry.sha256};
});
const dependencies = manifest.required_repository_dependencies.map(rel => ({path:rel, exists:fs.existsSync(path.join(target, rel))}));
const summary = {
  overlay_files_missing: overlayFiles.filter(x=>!x.exists).length,
  overlay_hash_mismatch: overlayFiles.filter(x=>x.exists && !x.hash_match).length,
  repository_dependencies_missing: dependencies.filter(x=>!x.exists).length,
  integration_ready_for_browser_test: overlayFiles.every(x=>x.exists && x.hash_match) && dependencies.every(x=>x.exists),
  browser_test_performed: false
};
console.log(JSON.stringify({target, overlay_files:overlayFiles, repository_dependencies:dependencies, summary}, null, 2));
if (summary.overlay_files_missing || summary.overlay_hash_mismatch) process.exitCode = 1;
