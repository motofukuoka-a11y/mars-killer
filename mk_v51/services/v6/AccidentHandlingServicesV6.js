import {CalculationError, BusinessRuleError} from './Version6Errors.js';

function number(request, field, {integer=true, required=true}={}) {
  if (!required && (request[field] == null || request[field] === '')) return 0;
  const value=Number(request[field]);
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new CalculationError(`${field}が不正です。`, {code:'V6_INVALID_ACCIDENT_INPUT',details:{field}});
  }
  return value;
}
const calculated=data=>({status:'calculated',additional_collection_yen:0,refund_fee_yen:0,...data});
const manual=(checks,data={})=>({status:'manual_confirmation_required',refund_amount_yen:null,additional_collection_yen:0,manual_checks:checks,...data});

export class AccidentFullRefundService {
  calculate(request) {
    const face=number(request,'face_value_yen');
    return calculated({handling_type:'accident_full_refund',refund_amount_yen:face,formula:`${face}円を全額払戻（手数料0円）`});
  }
}

export class AccidentTrainChangeService {
  calculate(request) {
    return calculated({handling_type:'accident_train_change',refund_amount_yen:0,change_fee_yen:0,formula:'事故列車変更：変更手数料0円、追加収受0円'});
  }
}

export class AccidentLaterTravelService {
  calculate(request) {
    return calculated({handling_type:'accident_later_travel',refund_amount_yen:0,change_fee_yen:0,formula:'後日の旅行へ変更：手数料0円、追加収受0円'});
  }
}

export class TravelDiscontinuationService {
  constructor({fareEngine=null}={}) { this.fareEngine=fareEngine; }
  calculate(request) {
    if (!this.fareEngine || typeof this.fareEngine.calculateUnusedSectionFare !== 'function') {
      return manual(['FareEngineで未乗車区間運賃を再計算してください。'],{handling_type:'accident_travel_discontinuation'});
    }
    const fareResult=this.fareEngine.calculateUnusedSectionFare(request);
    const unusedFare=Number(fareResult?.amount_yen);
    if (!Number.isFinite(unusedFare)||unusedFare<0||!Number.isInteger(unusedFare)) throw new CalculationError('未乗車区間運賃の計算に失敗しました。',{code:'V6_UNUSED_SECTION_FARE_FAILED'});
    const charge=number(request,'unused_charge_yen',{required:false});
    const facility=number(request,'unused_facility_charge_yen',{required:false});
    const refund=unusedFare+charge+facility;
    return calculated({handling_type:'accident_travel_discontinuation',unused_fare_yen:unusedFare,unused_charge_yen:charge,unused_facility_charge_yen:facility,refund_amount_yen:refund,formula:`${unusedFare}円＋${charge}円＋${facility}円＝${refund}円`});
  }
}

export class DelayRefundService {
  calculate(request) {
    const delay=number(request,'delay_minutes',{integer:false});
    if (delay<120) return {status:'not_eligible',refund_amount_yen:0,additional_collection_yen:0,reason_code:'DELAY_UNDER_120_MINUTES'};
    const expressCharge=number(request,'express_charge_yen');
    return calculated({handling_type:'accident_delay_refund',delay_minutes:delay,fare_refund_yen:0,charge_refund_yen:expressCharge,refund_amount_yen:expressCharge,formula:`急行料金${expressCharge}円を全額払戻`});
  }
}

export class ExpressContinuationService {
  calculate(request) {
    const expressCharge=number(request,'express_charge_yen');
    return calculated({handling_type:'accident_express_continuation',fare_refund_yen:0,charge_refund_yen:expressCharge,subsequent_express_charge_collected_yen:0,refund_amount_yen:expressCharge,formula:`使用中の急行料金${expressCharge}円を払戻し、後続急行料金は収受しない`});
  }
}

export class FreeReturnService {
  calculate(request) {
    if (request.returned_to_origin !== true) {
      return manual(['出発駅へ無賃送還後、原券の運賃・料金・設備料金を個別に確認してください。'],{handling_type:'accident_free_return',return_fare_collected_yen:0});
    }
    const fare=number(request,'paid_fare_yen',{required:false});
    const charge=number(request,'paid_charge_yen',{required:false});
    const facility=number(request,'paid_facility_charge_yen',{required:false});
    const refund=fare+charge+facility;
    return calculated({handling_type:'accident_free_return',return_fare_collected_yen:0,fare_refund_yen:fare,charge_refund_yen:charge,facility_refund_yen:facility,refund_amount_yen:refund,formula:`${fare}円＋${charge}円＋${facility}円＝${refund}円`});
  }
}

export class AlternativeRouteService {
  calculate(request) {
    const paidFare=number(request,'paid_fare_yen',{required:false});
    const paidCharge=number(request,'paid_charge_yen',{required:false});
    const paidFacility=number(request,'paid_facility_charge_yen',{required:false});
    const actualFare=number(request,'actual_fare_yen',{required:false});
    const actualCharge=number(request,'actual_charge_yen',{required:false});
    const actualFacility=number(request,'actual_facility_charge_yen',{required:false});
    const fareRefund=Math.max(0,paidFare-actualFare);
    const chargeRefund=Math.max(0,paidCharge-actualCharge);
    const facilityRefund=Math.max(0,paidFacility-actualFacility);
    const refund=fareRefund+chargeRefund+facilityRefund;
    return calculated({handling_type:'accident_alternative_route',fare:{paid_yen:paidFare,actual_yen:actualFare,refund_yen:fareRefund,shortage_collected_yen:0},charge:{paid_yen:paidCharge,actual_yen:actualCharge,refund_yen:chargeRefund,shortage_collected_yen:0},facility:{paid_yen:paidFacility,actual_yen:actualFacility,refund_yen:facilityRefund,shortage_collected_yen:0},refund_amount_yen:refund,formula:`運賃${fareRefund}円＋料金${chargeRefund}円＋設備料金${facilityRefund}円＝${refund}円`});
  }
}

export class AccidentCommuterService {
  calculate(request) {
    const days=number(request,'suspension_days');
    if (days<5) return {status:'not_eligible',refund_amount_yen:0,additional_collection_yen:0,reason_code:'SUSPENSION_UNDER_5_DAYS'};
    const daily=number(request,'accident_daily_refund_yen');
    const refund=daily*days;
    return calculated({handling_type:'accident_commuter_refund',suspension_days:days,daily_refund_yen:daily,refund_amount_yen:refund,formula:`${daily}円×${days}日＝${refund}円`});
  }
}

export class AccidentCouponService {
  calculate(request) {
    const days=number(request,'suspension_days');
    if (days<5) return {status:'not_eligible',refund_amount_yen:0,additional_collection_yen:0,reason_code:'SUSPENSION_UNDER_5_DAYS'};
    const couponFare=number(request,'coupon_fare_yen');
    const total=number(request,'total_sheets');
    const remaining=number(request,'remaining_sheets');
    if (total<=0 || remaining>total) throw new BusinessRuleError('普通回数券の券片数が不正です。',{code:'V6_INVALID_ACCIDENT_COUPON_SHEETS'});
    const refund=Math.floor(couponFare*remaining/total);
    return calculated({handling_type:'accident_coupon_refund',coupon_fare_yen:couponFare,total_sheets:total,remaining_sheets:remaining,refund_amount_yen:refund,formula:`${couponFare}円×${remaining}枚÷${total}枚＝${refund}円`});
  }
}
