import assert from 'node:assert/strict';
import Version6Platform from '../services/v6/Version6Platform.js';

const platform = new Version6Platform();
const invalidCases = [
  {},
  {business_mode:'passenger_refund',ticket_type:'ordinary_ticket',travel_state:'before_travel',face_value:-1},
  {business_mode:'passenger_refund',ticket_type:'coupon_ticket',travel_state:'after_travel',face_value:10000,total_sheets:5,remaining_sheets:6},
  {business_mode:'accident_handling',ticket_type:'ordinary_ticket',travel_state:'after_travel'},
  {business_mode:'accident_handling',ticket_type:'ordinary_ticket',travel_state:'after_travel',incident_type:'return_transport',origin:'A'},
  {business_mode:'accident_handling',ticket_type:'ordinary_ticket',travel_state:'after_travel',incident_type:'alternate_route',alternative_route:'B',original_fare:1000}
];
for (const request of invalidCases) {
  const result = platform.execute(request);
  assert.equal(result.error?.error_type,'ValidationError', JSON.stringify(result));
  assert.equal(result.error?.retryable,false);
  assert.equal(typeof result.error?.timestamp,'string');
}

const unsupported = platform.execute({business_mode:'unknown',ticket_type:'ordinary_ticket',travel_state:'before_travel'});
assert.equal(unsupported.error?.error_type,'BusinessRuleError');

const debugPlatform = new Version6Platform({debug:true});
const bad = debugPlatform.execute({business_mode:'passenger_refund',ticket_type:'ordinary_ticket',travel_state:'before_travel',face_value:'secret'});
assert.equal(bad.error.error_type,'ValidationError');
assert.equal(bad.error.message.includes('secret'),false);

console.log('Version 6.0 Stage5 abnormal acceptance: PASS');
