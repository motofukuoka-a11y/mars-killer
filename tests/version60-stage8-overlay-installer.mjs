import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mars-killer-v6-stage8-'));
for (const anchor of ['index.html','app.js','engine.js','service-worker.js']) {
  fs.writeFileSync(path.join(tmp, anchor), `legacy-${anchor}\n`);
}
const originalApp = fs.readFileSync(path.join(tmp,'app.js'),'utf8');
const run = (...args) => spawnSync(process.execPath, [path.join(root,'tools/apply-version6-overlay.mjs'), '--target', tmp, ...args], {encoding:'utf8'});

let result = run('--dry-run');
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(path.join(tmp,'app.js'),'utf8'), originalApp, 'dry-run must not modify files');

result = run('--apply');
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(path.join(tmp,'app.js'),'utf8'), fs.readFileSync(path.join(root,'app.js'),'utf8'));
assert.ok(fs.existsSync(path.join(tmp,'services/v6/Version6Platform.js')));
const backupRoot = path.join(tmp,'.mars-killer-backups');
const backupDirs = fs.readdirSync(backupRoot);
assert.equal(backupDirs.length,1);
const backup = path.join(backupRoot,backupDirs[0]);
assert.equal(fs.readFileSync(path.join(backup,'app.js'),'utf8'), originalApp);
assert.ok(fs.existsSync(path.join(backup,'APPLY_RECEIPT.json')));

const verify = spawnSync(process.execPath,[path.join(root,'tools/verify-version6-integration.mjs'),'--target',tmp],{encoding:'utf8'});
assert.equal(verify.status,0,verify.stderr);
const parsed = JSON.parse(verify.stdout);
assert.equal(parsed.summary.overlay_files_missing,0);
assert.equal(parsed.summary.overlay_hash_mismatch,0);
assert.equal(parsed.summary.integration_ready_for_browser_test,false, 'fixture intentionally lacks historical dependencies');

const manifest = JSON.parse(fs.readFileSync(path.join(root,'VERSION6_OVERLAY_MANIFEST.json'),'utf8'));
for (const entry of manifest.files) {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root,entry.path))).digest('hex');
  assert.equal(digest,entry.sha256,entry.path);
}
fs.rmSync(tmp,{recursive:true,force:true});
console.log('Version 6.0 Stage 8 overlay installer acceptance: PASS');
