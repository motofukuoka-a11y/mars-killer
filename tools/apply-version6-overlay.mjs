import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const overlayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const getArg = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const targetArg = getArg('--target');
const apply = args.includes('--apply');
const dryRun = args.includes('--dry-run') || !apply;
const backupArg = getArg('--backup-dir');

if (!targetArg) {
  console.error('Usage: node tools/apply-version6-overlay.mjs --target <repository> [--dry-run|--apply] [--backup-dir <directory>]');
  process.exit(2);
}

const targetRoot = path.resolve(targetArg);
const manifestPath = path.join(overlayRoot, 'VERSION6_OVERLAY_MANIFEST.json');
if (!fs.existsSync(manifestPath)) throw new Error('VERSION6_OVERLAY_MANIFEST.json がありません。');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const anchors = ['index.html', 'app.js', 'engine.js', 'service-worker.js'];
const missingAnchors = anchors.filter(file => !fs.existsSync(path.join(targetRoot, file)));
if (missingAnchors.length) {
  console.error(`適用先をVersion 5.1リポジトリとして確認できません。欠落: ${missingAnchors.join(', ')}`);
  process.exit(3);
}

const safeResolve = (root, rel) => {
  if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new Error(`不正な相対パス: ${rel}`);
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`適用先外のパス: ${rel}`);
  return resolved;
};
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.resolve(backupArg || path.join(targetRoot, '.mars-killer-backups', `v6-stage8-${timestamp}`));
const actions = [];

for (const entry of manifest.files) {
  const source = safeResolve(overlayRoot, entry.path);
  const destination = safeResolve(targetRoot, entry.path);
  if (!fs.existsSync(source)) throw new Error(`オーバーレイ内ファイル欠落: ${entry.path}`);
  const sourceHash = hashFile(source);
  if (sourceHash !== entry.sha256) throw new Error(`オーバーレイ改変を検出: ${entry.path}`);
  const exists = fs.existsSync(destination);
  const identical = exists && hashFile(destination) === sourceHash;
  actions.push({path: entry.path, action: identical ? 'skip_identical' : exists ? 'replace' : 'add'});
}

console.log(JSON.stringify({mode: dryRun ? 'dry-run' : 'apply', target: targetRoot, backup: apply ? backupRoot : null, summary: actions.reduce((a,x)=>(a[x.action]=(a[x.action]||0)+1,a),{}), actions}, null, 2));
if (dryRun) process.exit(0);

for (const action of actions) {
  if (action.action === 'skip_identical') continue;
  const source = safeResolve(overlayRoot, action.path);
  const destination = safeResolve(targetRoot, action.path);
  if (action.action === 'replace') {
    const backup = safeResolve(backupRoot, action.path);
    fs.mkdirSync(path.dirname(backup), {recursive:true});
    fs.copyFileSync(destination, backup);
  }
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  fs.copyFileSync(source, destination);
}

const receipt = {
  applied_at: new Date().toISOString(),
  overlay_version: manifest.overlay_version,
  target: targetRoot,
  backup: backupRoot,
  actions
};
fs.mkdirSync(backupRoot, {recursive:true});
fs.writeFileSync(path.join(backupRoot, 'APPLY_RECEIPT.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Version 6オーバーレイを適用しました。バックアップ: ${backupRoot}`);
