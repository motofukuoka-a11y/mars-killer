import assert from 'node:assert/strict';
import Version6Platform from '../services/v6/Version6Platform.js';

const fareEngine = {calculateUnusedSectionFare(request) { return {amount_yen: request.mock_unused_fare}; }};
const p = new Version6Platform({debug:true,fareEngine});
let r;

r=p.execute({business_mode:'accident_handling',ticket_type:'ordinary',travel_state:'before_travel',incident_type:'before_departure',selected_candidate:'accident_full_refund',face_value:5280,charge_amount:2640,facility_charge:4190});
assert.equal(r.result.refund_amount,12110); assert.equal(r.result.refund_fee,0); assert.equal(r.result.additional_collection,0);

r=p.execute({business_mode:'accident_handling',ticket_type:'reserved_express',travel_state:'before_travel',incident_type:'accident_change',before_train:'1D',after_train:'3D'});
assert.equal(r.result.handling_type,'accident_train_change'); assert.equal(r.result.additional_collection,0);

r=p.execute({business_mode:'accident_handling',ticket_type:'ordinary',travel_state:'after_travel',incident_type:'travel_cancelled',selected_candidate:'travel_discontinuation',unused_business_km:145,unused_conversion_km:145,mock_unused_fare:2640,charge_refund:3000,facility_refund:4190});
assert.equal(r.result.fare_refund,2640); assert.equal(r.result.fare_source,'FareEngine'); assert.equal(r.result.refund_amount,9830);

for (const [delay,status,refund] of [[119,'not_eligible',0],[120,'calculated',2640],[121,'calculated',2640]]) {
  r=p.execute({business_mode:'accident_handling',ticket_type:'reserved_express',travel_state:'after_travel',incident_type:'delay',delay_minutes:delay,express_charge:2640});
  assert.equal(r.result.status,status); assert.equal(r.result.refund_amount,refund);
}

r=p.execute({business_mode:'accident_handling',ticket_type:'reserved_express',travel_state:'after_travel',incident_type:'express_authorization',current_express_charge:2640,facility_refund:4190});
assert.equal(r.result.fare_refund,0); assert.equal(r.result.refund_amount,6830); assert.equal(r.result.next_express_additional_collection,0);

r=p.execute({business_mode:'accident_handling',ticket_type:'ordinary',travel_state:'after_travel',incident_type:'return_transport',origin:'札幌',return_station:'札幌',face_value:5280,charge_amount:2640,facility_charge:4190});
assert.equal(r.result.returned_to_origin,true); assert.equal(r.result.return_fare_collected,0); assert.equal(r.result.refund_amount,12110);

r=p.execute({business_mode:'accident_handling',ticket_type:'ordinary',travel_state:'after_travel',incident_type:'alternate_route',alternative_route:'長万部→小樽→札幌',original_fare:10000,actual_fare:9000,original_charge:3000,actual_charge:3500,original_facility:4000,actual_facility:0,facility_available:false});
assert.equal(r.result.fare_difference,1000); assert.equal(r.result.charge_difference,0); assert.equal(r.result.facility_difference,4000); assert.equal(r.result.refund_amount,5000); assert.equal(r.result.additional_collection,0);

r=p.execute({business_mode:'accident_handling',ticket_type:'commuter_pass',travel_state:'after_travel',incident_type:'commuter_accident',suspension_days:5,daily_split_fare:513});
assert.equal(r.result.refund_amount,2560);
r=p.execute({business_mode:'accident_handling',ticket_type:'commuter_pass',travel_state:'after_travel',incident_type:'commuter_accident',suspension_days:4,daily_split_fare:513});
assert.equal(r.result.status,'not_eligible');

r=p.execute({business_mode:'accident_handling',ticket_type:'coupon_ticket',travel_state:'after_travel',incident_type:'coupon_accident',suspension_days:5,coupon_section_single_fare:220,remaining_sheets:8,total_sheets:11});
assert.equal(r.result.refund_amount,160);

r=p.execute({business_mode:'accident_handling',ticket_type:'ordinary',travel_state:'after_travel',incident_type:'travel_cancelled',unused_business_km:20});
assert.equal(r.result.status,'multiple_choices_available');

console.log('Version 6.0 Stage3 accident handling acceptance: PASS');
