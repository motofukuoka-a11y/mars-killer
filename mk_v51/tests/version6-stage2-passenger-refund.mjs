import assert from 'node:assert/strict';
import Version6Platform from '../services/v6/Version6Platform.js';
import {BusinessMode,RefundStage,ResultStatus} from '../services/v6/Version6Models.js';

const fareEngine={
  calculateUsedSectionFare(request) {
    return {amount_yen:request.mock_used_section_fare_yen,discount_re_evaluated:request.ticket_type==='discount_ordinary'};
  }
};
const platform=new Version6Platform({fareEngine});
let result;

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.BEFORE_TRAVEL,ticket_type:'ordinary',face_value_yen:5280});
assert.equal(result.status,ResultStatus.CALCULATED);
assert.equal(result.calculation.refund_fee_yen,220);
assert.equal(result.calculation.refund_amount_yen,5060);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.BEFORE_TRAVEL,ticket_type:'reserved_express',face_value_yen:2640,days_before_departure:2});
assert.equal(result.calculation.refund_fee_yen,340);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.BEFORE_TRAVEL,ticket_type:'reserved_green',face_value_yen:6830,facility_charge_yen:4190,days_before_departure:0});
assert.equal(result.calculation.fee_base_yen,4190);
assert.equal(result.calculation.refund_fee_yen,1250);
assert.equal(result.calculation.refund_amount_yen,5580);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.BEFORE_TRAVEL,ticket_type:'standing_express',face_value_yen:2640,departure_time_passed:true});
assert.equal(result.status,ResultStatus.NOT_ELIGIBLE);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.AFTER_TRAVEL_START,ticket_type:'ordinary',face_value_yen:5280,unused_business_km:100,mock_used_section_fare_yen:1800});
assert.equal(result.status,ResultStatus.NOT_ELIGIBLE);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.AFTER_TRAVEL_START,ticket_type:'discount_ordinary',face_value_yen:5280,unused_business_km:101,mock_used_section_fare_yen:2460});
assert.equal(result.status,ResultStatus.CALCULATED);
assert.equal(result.calculation.refund_amount_yen,2600);
assert.equal(result.calculation.used_section_fare_source,'FareEngine');
assert.equal(result.calculation.discount_re_evaluated,true);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.AFTER_TRAVEL_START,ticket_type:'commuter_pass',face_value_yen:39460,one_way_fare_yen:210,elapsed_days:2,one_month_commuter_fare_yen:7690,period_fare_yen:2200,elapsed_periods:1});
assert.equal(result.calculation.selected_method,'normal_calculation');
assert.equal(result.calculation.refund_amount_yen,38400);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.AFTER_TRAVEL_START,ticket_type:'commuter_pass',face_value_yen:39460,one_way_fare_yen:210,elapsed_days:30,one_month_commuter_fare_yen:7690,period_fare_yen:2200,elapsed_periods:1});
assert.equal(result.calculation.selected_method,'period_calculation');
assert.equal(result.calculation.refund_amount_yen,37040);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.AFTER_TRAVEL_START,ticket_type:'coupon_ticket',face_value_yen:2200,total_sheets:11,remaining_sheets:8,coupon_section_single_fare_yen:220});
assert.equal(result.calculation.used_sheets,3);
assert.equal(result.calculation.refund_amount_yen,1320);

result=await platform.execute({mode:BusinessMode.PASSENGER_REFUND,refund_stage:RefundStage.BEFORE_TRAVEL,ticket_type:'coupon_ticket',face_value_yen:2200,total_sheets:11,remaining_sheets:12});
assert.equal(result.status,ResultStatus.INVALID_INPUT);
assert.ok(result.error.message.includes('残余枚数'));

console.log('Version 6.0 Stage 2 actual passenger refund tests: PASS');
