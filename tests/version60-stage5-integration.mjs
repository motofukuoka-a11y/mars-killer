import assert from 'node:assert/strict';
import Version6Platform from '../services/v6/Version6Platform.js';

const fareEngine = {
  calculateUsedSectionFare(request) {
    if (request.used_section_fare === undefined) throw Object.assign(new Error('fare missing'), {name:'CalculationError', code:'FARE_REQUIRED'});
    return {amount_yen:Number(request.used_section_fare),discount_re_evaluated:false};
  }
};
const platform = new Version6Platform({fareEngine});

const cases = [
  [{business_mode:'passenger_refund',ticket_type:'ordinary',travel_state:'before_travel',face_value:5280,request_date:'2026-07-19',start_date:'2026-07-20'}, 5060],
  [{business_mode:'passenger_refund',ticket_type:'ordinary',travel_state:'after_travel',face_value:5280,unused_business_km:101,used_section_fare:2460}, 2600],
  [{business_mode:'passenger_refund',ticket_type:'coupon_ticket',travel_state:'after_travel',face_value:10000,total_sheets:11,remaining_sheets:6,coupon_section_single_fare:1000}, 4780],
  [{business_mode:'accident_handling',ticket_type:'ordinary',travel_state:'before_travel',incident_type:'before_departure',selected_candidate:'accident_full_refund',fare_amount:3000,charge_amount:2000,facility_charge:1000}, 6000],
  [{business_mode:'accident_handling',ticket_type:'express_ticket',travel_state:'after_travel',incident_type:'delay',delay_minutes:120,express_charge:1730,selected_candidate:'delay_refund'}, 1730],
  [{business_mode:'accident_handling',ticket_type:'ordinary',travel_state:'after_travel',incident_type:'alternate_route',alternative_route:'B',original_fare:4000,actual_fare:3500,original_charge:2000,actual_charge:1800,original_facility:1000,actual_facility:800,selected_candidate:'alternative_route'}, 900]
];
for (const [request, expected] of cases) {
  const result = platform.execute(request);
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(result.result.refund_amount, expected, JSON.stringify(result));
}

const ambiguous = platform.execute({business_mode:'accident_handling',ticket_type:'ordinary',travel_state:'before_travel',incident_type:'before_departure',fare_amount:1000});
assert.equal(ambiguous.result.status,'multiple_choices_available');
assert.equal(ambiguous.rule_name,null);
assert.ok(ambiguous.warnings.length >= 1);

console.log('Version 6.0 Stage5 integration acceptance: PASS');
