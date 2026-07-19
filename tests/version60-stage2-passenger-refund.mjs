import assert from 'node:assert/strict';
import Version6Platform from '../services/v6/Version6Platform.js';

const fareEngine = {calculateUsedSectionFare(request) { return {amount_yen: request.mock_used_fare, discount_re_evaluated: request.ticket_type === 'discount_ordinary'}; }};
const p = new Version6Platform({debug:true,fareEngine});
let r;

r=p.execute({business_mode:'passenger_refund',ticket_type:'ordinary',travel_state:'before_travel',face_value:5280});
assert.equal(r.result.refund_amount,5060);

r=p.execute({business_mode:'passenger_refund',ticket_type:'reserved_green',travel_state:'before_travel',face_value:6830,facility_charge:4190,days_before_departure:0});
assert.equal(r.result.refund_fee,1250); assert.equal(r.result.refund_amount,5580);

r=p.execute({business_mode:'passenger_refund',ticket_type:'reserved_express',travel_state:'before_travel',face_value:2640,days_before_departure:2});
assert.equal(r.result.refund_fee,340);

r=p.execute({business_mode:'passenger_refund',ticket_type:'ordinary',travel_state:'after_travel',face_value:5280,unused_business_km:100,mock_used_fare:1800});
assert.equal(r.result.status,'not_eligible');
r=p.execute({business_mode:'passenger_refund',ticket_type:'discount_ordinary',travel_state:'after_travel',face_value:5280,unused_business_km:101,mock_used_fare:2460});
assert.equal(r.result.refund_amount,2600); assert.equal(r.result.used_section_fare_source,'FareEngine'); assert.equal(r.result.discount_re_evaluated,true);

r=p.execute({business_mode:'passenger_refund',ticket_type:'commuter_pass',travel_state:'after_travel',face_value:39460,one_way_fare:210,elapsed_days:2,one_month_commuter_fare:7690,period_fare:2200,elapsed_periods:1});
assert.equal(r.result.selected_method,'normal_calculation'); assert.equal(r.result.refund_amount,38400);

r=p.execute({business_mode:'passenger_refund',ticket_type:'commuter_pass',travel_state:'after_travel',face_value:39460,one_way_fare:210,elapsed_days:30,one_month_commuter_fare:7690,period_fare:2200,elapsed_periods:1});
assert.equal(r.result.selected_method,'period_calculation'); assert.equal(r.result.refund_amount,37040);

r=p.execute({business_mode:'passenger_refund',ticket_type:'coupon_ticket',travel_state:'after_travel',face_value:2200,total_sheets:11,remaining_sheets:8,coupon_section_single_fare:220});
assert.equal(r.result.refund_amount,1320); assert.equal(r.result.used_sheets,3);

r=p.execute({business_mode:'passenger_refund',ticket_type:'coupon_ticket',travel_state:'before_travel',face_value:2200,total_sheets:11,remaining_sheets:12});
assert.equal(r.error.error_type,'ValidationError');

console.log('Version 6.0 Stage2 passenger refund acceptance: PASS');
