import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['tools/release-preflight-stage7.mjs'], { stdio: 'inherit' });
const report = JSON.parse(fs.readFileSync('STAGE7_PREFLIGHT.json', 'utf8'));
assert.equal(report.summary.required_missing, 0);
assert.equal(report.summary.critical_assets_missing, 0);
assert.equal(report.summary.overlay_internal_gate_passed, true);
assert.equal(report.summary.full_application_release_ready, false);
assert.ok(report.summary.release_blockers.length >= 2);
console.log('Version 6.0 Stage7 release preflight acceptance: PASS');
