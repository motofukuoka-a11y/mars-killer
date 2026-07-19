import assert from 'node:assert/strict';
import fs from 'node:fs';
import Version6RefundController from '../ui/Version6RefundController.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/Version 6 旅客任意払戻/);
assert.match(html,/id="version6Options"/);
assert.match(html,/Version6RefundPanel\.js/);
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(app,/__MARS_KILLER_V6_CONTROLLER__/);
const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
assert.match(sw,/CRITICAL_ASSETS/);
assert.match(sw,/Promise\.allSettled/);
assert.match(sw,/mars-killer-v6\.0-(?:stage6|stage7|ui-refactor)/);
assert.equal(typeof Version6RefundController,'function');
console.log('Version 6.0 Stage 6 UI integration acceptance: PASS');
