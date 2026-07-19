import RefundRoundingServiceV6 from './RefundRoundingServiceV6.js';

const amount = (request, field, fallback = 0) => {
  const raw = request[field] ?? fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw Object.assign(new Error(`${field}が不正です。`), {name:'CalculationError', code:'INVALID_AMOUNT'});
  }
  return Math.trunc(value);
};

const requiredText = (request, field) => {
  const value = request[field];
  if (value === undefined || value === null || value === '') {
    throw Object.assign(new Error(`${field}は必須です。`), {name:'CalculationError', code:'MISSING_FIELD'});
  }
  return value;
};

export class AccidentRefundService {
  calculate(request) {
    return {
      status: 'calculated',
      handling_type: 'accident_full_refund',
      fare_refund: amount(request, 'fare_amount', request.face_value),
      charge_refund: amount(request, 'charge_amount'),
      facility_refund: amount(request, 'facility_charge'),
      refund_fee: 0,
      refund_amount: amount(request, 'fare_amount', request.face_value) + amount(request, 'charge_amount') + amount(request, 'facility_charge'),
      additional_collection: 0,
      formula: '運賃＋料金＋設備料金（払戻手数料0円）'
    };
  }
}

export class AccidentChangeService {
  calculate(request) {
    return {
      status: 'calculated',
      handling_type: 'accident_train_change',
      before_train: request.before_train ?? null,
      after_train: request.after_train ?? null,
      before_departure: request.before_departure ?? null,
      after_departure: request.after_departure ?? null,
      seat_before: request.seat_before ?? null,
      seat_after: request.seat_after ?? null,
      refund_amount: 0,
      additional_collection: 0,
      formula: '事故列変のため払戻手数料・追加収受なし'
    };
  }
}

export class TravelDiscontinuationService {
  constructor({fareEngine = null} = {}) { this.fareEngine = fareEngine; }
  calculate(request) {
    let fareResult = null;
    if (this.fareEngine?.calculateUnusedSectionFare) fareResult = this.fareEngine.calculateUnusedSectionFare(request);
    const fareRefund = fareResult ? amount(fareResult, 'amount_yen') : amount(request, 'unused_fare');
    const chargeRefund = amount(request, 'charge_refund');
    const facilityRefund = amount(request, 'facility_refund');
    return {
      status: 'calculated',
      handling_type: 'travel_discontinuation',
      unused_sections: request.unused_sections ?? [],
      unused_business_km: amount(request, 'unused_business_km'),
      unused_conversion_km: amount(request, 'unused_conversion_km'),
      unused_fare: fareRefund,
      fare_refund: fareRefund,
      charge_refund: chargeRefund,
      facility_refund: facilityRefund,
      refund_amount: fareRefund + chargeRefund + facilityRefund,
      additional_collection: 0,
      fare_source: fareResult ? 'FareEngine' : 'request',
      formula: '未乗車区間運賃＋未使用料金＋未使用設備料金'
    };
  }
}

export class DelayRefundService {
  calculate(request) {
    const delay = request.delay_minutes !== undefined
      ? amount(request, 'delay_minutes')
      : Math.max(0, Math.trunc((new Date(requiredText(request,'actual_arrival')) - new Date(requiredText(request,'scheduled_arrival'))) / 60000));
    const eligible = delay >= 120;
    const chargeRefund = eligible ? amount(request, 'express_charge') : 0;
    return {
      status: eligible ? 'calculated' : 'not_eligible',
      handling_type: 'delay_refund',
      delay_minutes: delay,
      fare_refund: 0,
      charge_refund: chargeRefund,
      facility_refund: 0,
      refund_amount: chargeRefund,
      additional_collection: 0,
      reason: eligible ? '到着時刻が予定より120分以上遅延しています。' : '遅延が120分未満です。',
      formula: eligible ? '急行料金全額払戻（運賃・使用済設備料金は払戻なし）' : null
    };
  }
}

export class ExpressContinuationService {
  calculate(request) {
    const chargeRefund = amount(request, 'current_express_charge');
    const facilityRefund = amount(request, 'facility_refund');
    return {
      status: 'calculated',
      handling_type: 'express_continuation',
      fare_refund: 0,
      charge_refund: chargeRefund,
      facility_refund: facilityRefund,
      refund_amount: chargeRefund + facilityRefund,
      next_express_additional_collection: 0,
      additional_collection: 0,
      formula: '使用中の急行料金を全額払戻し、後続急行列車の急行料金は収受しない'
    };
  }
}

export class FreeReturnService {
  calculate(request) {
    requiredText(request, 'return_station');
    const returned = request.return_station === request.origin || request.returned_to_origin === true;
    if (!returned) return {status:'not_eligible',handling_type:'free_return',returned_to_origin:false,refund_amount:0,additional_collection:0,reason:'出発駅への送還ではありません。'};
    const fareRefund = amount(request, 'fare_amount', request.face_value);
    const chargeRefund = amount(request, 'charge_amount');
    const facilityRefund = amount(request, 'facility_charge');
    return {
      status: 'calculated',
      handling_type: 'free_return',
      returned_to_origin: true,
      return_fare_collected: 0,
      fare_refund: fareRefund,
      charge_refund: chargeRefund,
      facility_refund: facilityRefund,
      refund_amount: fareRefund + chargeRefund + facilityRefund,
      additional_collection: 0,
      formula: '出発駅まで無賃送還後、運賃・料金・設備料金を全額払戻'
    };
  }
}

export class ComparisonService {
  compare(original, actual) {
    const originalAmount = Math.max(0, Math.trunc(Number(original || 0)));
    const actualAmount = Math.max(0, Math.trunc(Number(actual || 0)));
    return {original_amount:originalAmount,actual_amount:actualAmount,difference:Math.max(0,originalAmount-actualAmount)};
  }
}

export class AlternativeRouteService {
  constructor({comparison = new ComparisonService()} = {}) { this.comparison = comparison; }
  calculate(request) {
    requiredText(request, 'alternative_route');
    const fare = this.comparison.compare(request.original_fare, request.actual_fare);
    const charge = this.comparison.compare(request.original_charge, request.actual_charge);
    let facility;
    if (request.facility_available === false && request.original_facility !== undefined) {
      facility = this.comparison.compare(request.original_facility, 0);
    } else {
      facility = this.comparison.compare(request.original_facility, request.actual_facility);
    }
    return {
      status: 'calculated',
      handling_type: 'alternative_route',
      fare_comparison: fare,
      charge_comparison: charge,
      facility_comparison: facility,
      fare_difference: fare.difference,
      charge_difference: charge.difference,
      facility_difference: facility.difference,
      refund_amount: fare.difference + charge.difference + facility.difference,
      additional_collection: 0,
      formula: '運賃・料金・設備料金を個別比較し、過剰額のみ払戻（不足額は収受しない）'
    };
  }
}

export class AccidentCommuterService {
  constructor({rounding = new RefundRoundingServiceV6()} = {}) { this.rounding = rounding; }
  calculate(request) {
    const days = amount(request, 'suspension_days');
    if (days < 5) return {status:'not_eligible',handling_type:'accident_commuter',refund_amount:0,charge_refund:0,reason:'全く運行できない状態が連続5日未満です。'};
    const daily = amount(request, 'daily_split_fare');
    const refund = this.rounding.floor10(daily * days);
    return {status:'calculated',handling_type:'accident_commuter',ticket_type:'commuter_pass',refund_amount:refund,charge_refund:0,additional_collection:0,formula:`日割運賃${daily}円×運行休止${days}日（端数整理）`};
  }
}

export class AccidentCouponService {
  constructor({rounding = new RefundRoundingServiceV6()} = {}) { this.rounding = rounding; }
  calculate(request) {
    const days = amount(request, 'suspension_days');
    if (days < 5) return {status:'not_eligible',handling_type:'accident_coupon',refund_amount:0,charge_refund:0,reason:'全く運行できない状態が連続5日未満です。'};
    const fare = amount(request, 'coupon_section_single_fare');
    const remaining = amount(request, 'remaining_sheets');
    const total = amount(request, 'total_sheets', 11);
    if (total <= 0 || remaining > total) throw Object.assign(new Error('回数券枚数が不正です。'), {name:'CalculationError',code:'INVALID_COUPON_COUNT'});
    const refund = this.rounding.floor10(fare * remaining / total);
    return {status:'calculated',handling_type:'accident_coupon',ticket_type:'coupon_ticket',refund_amount:refund,charge_refund:0,additional_collection:0,formula:`普通回数旅客運賃${fare}円×残余${remaining}枚÷総券片${total}枚（端数整理）`};
  }
}
