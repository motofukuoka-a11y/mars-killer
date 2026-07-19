import assert from 'node:assert/strict';
import Version6Platform from '../services/v6/Version6Platform.js';
import {BusinessMode,AccidentTiming,ResultStatus} from '../services/v6/Version6Models.js';

const fareEngine={calculateUnusedSectionFare:r=>({amount_yen:r.mock_unused_fare_yen})};
const platform=new Version6Platform({fareEngine});
let result;

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.BEFORE_DEPARTURE,ticket_type:'ordinary',face_value_yen:5280});
assert.equal(result.status,ResultStatus.MANUAL_CONFIRMATION_REQUIRED);
assert.equal(result.candidates.length,3);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.BEFORE_DEPARTURE,ticket_type:'ordinary',face_value_yen:5280,selected_candidate_id:'accident-full-refund'});
assert.equal(result.calculation.refund_amount_yen,5280);
assert.equal(result.calculation.refund_fee_yen,0);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'ordinary',face_value_yen:5280,delay_minutes:119});
assert.equal(result.status,ResultStatus.MANUAL_CONFIRMATION_REQUIRED);
assert.equal(result.candidates.some(x=>x.id==='delay-refund'),false);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'ordinary',face_value_yen:5280,delay_minutes:120,express_charge_yen:2640,selected_candidate_id:'delay-refund'});
assert.equal(result.calculation.refund_amount_yen,2640);
assert.equal(result.calculation.fare_refund_yen,0);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'ordinary',face_value_yen:5280,delay_minutes:0,mock_unused_fare_yen:1800,unused_charge_yen:500,unused_facility_charge_yen:300,selected_candidate_id:'travel-discontinuation'});
assert.equal(result.calculation.refund_amount_yen,2600);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'ordinary',face_value_yen:5280,delay_minutes:0,express_charge_yen:2640,selected_candidate_id:'express-continuation'});
assert.equal(result.calculation.refund_amount_yen,2640);
assert.equal(result.calculation.subsequent_express_charge_collected_yen,0);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'ordinary',face_value_yen:5280,delay_minutes:0,returned_to_origin:true,paid_fare_yen:3000,paid_charge_yen:1000,paid_facility_charge_yen:500,selected_candidate_id:'free-return'});
assert.equal(result.calculation.return_fare_collected_yen,0);
assert.equal(result.calculation.refund_amount_yen,4500);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'ordinary',face_value_yen:5280,delay_minutes:0,paid_fare_yen:3000,actual_fare_yen:3500,paid_charge_yen:1500,actual_charge_yen:1000,paid_facility_charge_yen:800,actual_facility_charge_yen:0,selected_candidate_id:'alternative-route'});
assert.equal(result.calculation.refund_amount_yen,1300);
assert.equal(result.calculation.fare.shortage_collected_yen,0);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'commuter_pass',face_value_yen:39460,suspension_days:4,accident_daily_refund_yen:420});
assert.equal(result.status,ResultStatus.NOT_ELIGIBLE);
result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'commuter_pass',face_value_yen:39460,suspension_days:5,accident_daily_refund_yen:420});
assert.equal(result.calculation.refund_amount_yen,2100);

result=await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING,accident_timing:AccidentTiming.AFTER_DEPARTURE,ticket_type:'coupon_ticket',face_value_yen:2200,suspension_days:5,coupon_fare_yen:2200,total_sheets:11,remaining_sheets:8});
assert.equal(result.calculation.refund_amount_yen,1600);

console.log('Version 6.0 Stage 3 actual accident handling tests: PASS');
