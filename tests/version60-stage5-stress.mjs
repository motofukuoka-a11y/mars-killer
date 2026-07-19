import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import Version6Platform from '../services/v6/Version6Platform.js';

const platform = new Version6Platform();
const request = {business_mode:'passenger_refund',ticket_type:'ordinary',travel_state:'before_travel',face_value:5280,request_date:'2026-07-19',start_date:'2026-07-20'};
const iterations = 10000;
const start = performance.now();
for (let i=0;i<iterations;i++) {
  const result = platform.execute({...request, request_id:`stress-${i}`});
  assert.equal(result.result.refund_amount,5060);
}
const elapsed = performance.now()-start;
const average = elapsed/iterations;
assert.ok(Number.isFinite(average));
assert.equal(platform.audit.entries.length,iterations);
console.log(JSON.stringify({status:'PASS',iterations,elapsed_ms:Number(elapsed.toFixed(3)),average_ms:Number(average.toFixed(6))}));
