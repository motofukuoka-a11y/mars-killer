import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const required = [
  'services/v6/Version6Platform.js','services/v6/PassengerRefundServicesV6.js','services/v6/AccidentHandlingServicesV6.js',
  'tests/version60-stage1-acceptance.mjs','tests/version60-stage2-passenger-refund.mjs','tests/version60-stage3-accident-handling.mjs',
  'tests/version60-stage4-common-infrastructure.mjs','tests/version60-stage5-integration.mjs','tests/version60-stage5-abnormal.mjs','tests/version60-stage5-stress.mjs'
];
const missing = required.filter(file => !fs.existsSync(path.join(root,file)));
const tests = required.filter(file => file.startsWith('tests/'));
const results = [];
for (const file of tests) {
  const run = spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8'});
  results.push({file,passed:run.status===0,stdout:run.stdout.trim(),stderr:run.stderr.trim()});
}
const jsFiles = [];
const walk = dir => { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { const full=path.join(dir,entry.name); if (entry.isDirectory()) walk(full); else if (/\.(m?js)$/.test(entry.name)) jsFiles.push(path.relative(root,full)); } };
for (const dir of ['services','engines','validation','debug','models','tests','tools']) if (fs.existsSync(dir)) walk(dir);
const syntax = jsFiles.map(file => { const run=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'}); return {file,passed:run.status===0,stderr:run.stderr.trim()}; });
const releaseReady = missing.length===0 && results.every(x=>x.passed) && syntax.every(x=>x.passed);
const report = {generated_at:new Date().toISOString(),release_ready:releaseReady,missing_files:missing,test_results:results,syntax_checked:syntax.length,syntax_failures:syntax.filter(x=>!x.passed)};
fs.writeFileSync(path.join(root,'STAGE5_RELEASE_GATE.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exit(releaseReady?0:1);
