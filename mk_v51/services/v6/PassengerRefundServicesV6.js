import RefundRuleServiceV6 from './RefundRuleServiceV6.js';
import RefundRoundingServiceV6 from './RefundRoundingServiceV6.js';
import {CalculationError, BusinessRuleError} from './Version6Errors.js';

const RESERVED_TYPES = new Set(['reserved_express','reserved_green','sleeper','reserved_seat']);
const FACILITY_PERCENTAGE_TYPES = new Set(['reserved_green','sleeper','reserved_seat']);

function requiredNumber(request, field, {integer = true, positive = false} = {}) {
  const value = Number(request[field]);
  const invalid = !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value)) || (positive && value <= 0);
  if (invalid) throw new CalculationError(`${field}が不正です。`, {code:'V6_INVALID_CALCULATION_INPUT', details:{field}});
  return value;
}

function calculated(data) {
  return {status:'calculated', additional_collection_yen:0, ...data};
}

export class BeforeTravelRefundService {
  constructor({rules = new RefundRuleServiceV6(), rounding = new RefundRoundingServiceV6()} = {}) {
    this.rules = rules;
    this.rounding = rounding;
  }

  calculate(request) {
    const face = requiredNumber(request, 'face_value_yen');
    const type = request.ticket_type;

    if (request.special_product === true) {
      return {status:'manual_confirmation_required', refund_amount_yen:null, manual_checks:['特別企画乗車券の発売条件を確認してください。']};
    }
    if (type === 'standing_express' && request.departure_time_passed === true) {
      return {status:'not_eligible', refund_amount_yen:0, reason_code:'STANDING_EXPRESS_AFTER_DEPARTURE'};
    }
    if (type === 'seat_unassigned' && request.travel_date_started === true) {
      return {status:'not_eligible', refund_amount_yen:0, reason_code:'SEAT_UNASSIGNED_AFTER_START_DATE'};
    }

    let fee;
    let feeBase = face;
    if (RESERVED_TYPES.has(type)) {
      const rule = this.rules.reservedFeeRule(request.days_before_departure);
      if (!rule) throw new BusinessRuleError('列車出発日までの日数が必要です。', {code:'V6_RESERVED_TIMING_REQUIRED'});
      if (rule.method === 'fixed') {
        fee = rule.fee_yen;
      } else {
        feeBase = FACILITY_PERCENTAGE_TYPES.has(type)
          ? requiredNumber(request, 'facility_charge_yen')
          : face;
        fee = Math.max(rule.minimum_yen, this.rounding.floor10(feeBase * rule.rate));
      }
    } else {
      fee = this.rules.feeFor(type);
      if (fee == null) throw new BusinessRuleError('券種に対応する払戻手数料が規則マスターにありません。', {code:'V6_REFUND_RULE_NOT_FOUND', details:{ticket_type:type}});
    }

    const refund = Math.max(0, face - fee);
    return calculated({
      handling_type:'passenger_before_travel_refund',
      face_value_yen:face,
      refund_fee_yen:fee,
      fee_base_yen:feeBase,
      refund_amount_yen:refund,
      formula:`${face}円－${fee}円＝${refund}円`
    });
  }
}

export class AfterTravelRefundService {
  constructor({rules = new RefundRuleServiceV6(), fareEngine = null} = {}) {
    this.rules = rules;
    this.fareEngine = fareEngine;
  }

  calculate(request) {
    const unusedKm = requiredNumber(request, 'unused_business_km', {integer:false});
    const minimumKm = this.rules.minimumUnusedBusinessKm();
    if (unusedKm < minimumKm) {
      return {status:'not_eligible', refund_amount_yen:0, reason_code:'UNUSED_SECTION_UNDER_101KM', minimum_unused_business_km:minimumKm};
    }
    if (!this.fareEngine || typeof this.fareEngine.calculateUsedSectionFare !== 'function') {
      return {status:'manual_confirmation_required', refund_amount_yen:null, manual_checks:['FareEngineで既乗区間運賃を再計算してください。']};
    }

    const usedResult = this.fareEngine.calculateUsedSectionFare(request);
    const usedFare = Number(usedResult?.amount_yen);
    if (!Number.isFinite(usedFare) || usedFare < 0 || !Number.isInteger(usedFare)) {
      throw new CalculationError('FareEngineによる既乗区間運賃計算に失敗しました。', {code:'V6_USED_SECTION_FARE_FAILED'});
    }

    const face = requiredNumber(request, 'face_value_yen');
    const fee = this.rules.afterTravelFee();
    const refund = Math.max(0, face - usedFare - fee);
    return calculated({
      handling_type:'passenger_after_travel_refund',
      face_value_yen:face,
      used_section_fare_yen:usedFare,
      used_section_fare_source:'FareEngine',
      discount_re_evaluated:Boolean(usedResult.discount_re_evaluated),
      refund_fee_yen:fee,
      refund_amount_yen:refund,
      formula:`${face}円－${usedFare}円－${fee}円＝${refund}円`
    });
  }
}

export class CommuterPassRefundService {
  constructor({rules = new RefundRuleServiceV6()} = {}) { this.rules = rules; }

  calculate(request) {
    const face = requiredNumber(request, 'face_value_yen');
    const fee = this.rules.commuterRule().fee_yen;
    if (request.refund_stage === 'before_travel' || request.before_validity_start === true) {
      const refund = Math.max(0, face - fee);
      return calculated({handling_type:'passenger_commuter_refund', selected_method:'before_validity_start', refund_fee_yen:fee, refund_amount_yen:refund, formula:`${face}円－${fee}円＝${refund}円`});
    }

    const oneWayFare = requiredNumber(request, 'one_way_fare_yen');
    const elapsedDays = requiredNumber(request, 'elapsed_days');
    const oneMonthFare = requiredNumber(request, 'one_month_commuter_fare_yen');
    const periodFare = requiredNumber(request, 'period_fare_yen');
    const elapsedPeriods = requiredNumber(request, 'elapsed_periods');

    const normalUsed = Math.min(oneMonthFare, oneWayFare * this.rules.commuterRule().daily_round_trips * elapsedDays);
    const periodUsed = periodFare * elapsedPeriods;
    const normalRefund = Math.max(0, face - normalUsed - fee);
    const periodRefund = Math.max(0, face - periodUsed - fee);
    const selectedMethod = periodRefund > normalRefund ? 'period_calculation' : 'normal_calculation';
    const refund = Math.max(normalRefund, periodRefund);

    return calculated({
      handling_type:'passenger_commuter_refund',
      selected_method:selectedMethod,
      refund_fee_yen:fee,
      refund_amount_yen:refund,
      normal_calculation:{used_amount_yen:normalUsed, refund_amount_yen:normalRefund},
      period_calculation:{used_amount_yen:periodUsed, refund_amount_yen:periodRefund},
      comparison_reason:`通常計算${normalRefund}円と旬割計算${periodRefund}円を比較し、多い払戻額を採用しました。`
    });
  }
}

export class CouponTicketRefundService {
  constructor({rules = new RefundRuleServiceV6()} = {}) { this.rules = rules; }

  calculate(request) {
    const face = requiredNumber(request, 'face_value_yen');
    const total = requiredNumber(request, 'total_sheets', {positive:true});
    const remaining = requiredNumber(request, 'remaining_sheets');
    if (remaining > total) throw new BusinessRuleError('残余枚数は総券片数以下で指定してください。', {code:'V6_INVALID_COUPON_SHEETS'});

    const usedSheets = total - remaining;
    const fee = this.rules.couponRule().fee_yen;
    if (usedSheets === 0) {
      const refund = Math.max(0, face - fee);
      return calculated({handling_type:'passenger_coupon_refund', used_sheets:0, remaining_sheets:remaining, refund_fee_yen:fee, refund_amount_yen:refund, formula:`${face}円－${fee}円＝${refund}円`});
    }

    const singleFare = requiredNumber(request, 'coupon_section_single_fare_yen');
    const deduction = singleFare * usedSheets;
    const refund = Math.max(0, face - deduction - fee);
    return calculated({
      handling_type:'passenger_coupon_refund',
      used_sheets:usedSheets,
      remaining_sheets:remaining,
      deduction_amount_yen:deduction,
      refund_fee_yen:fee,
      refund_amount_yen:refund,
      formula:`${face}円－${singleFare}円×${usedSheets}枚－${fee}円＝${refund}円`
    });
  }
}
