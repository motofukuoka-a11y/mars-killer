import RefundRuleServiceV6 from './RefundRuleServiceV6.js';
import RefundRoundingServiceV6 from './RefundRoundingServiceV6.js';

const requiredNumber = (request, field) => {
  const value = Number(request[field]);
  if (!Number.isFinite(value) || value < 0) throw Object.assign(new Error(`${field}が不正です。`), {name:'CalculationError', code:'INVALID_AMOUNT'});
  return value;
};

export class BeforeTravelRefundService {
  constructor({rules = new RefundRuleServiceV6(), rounding = new RefundRoundingServiceV6()} = {}) { this.rules = rules; this.rounding = rounding; }
  calculate(request) {
    const face = requiredNumber(request, 'face_value');
    const type = request.ticket_type;
    if (request.special_product) return {status:'manual_confirmation_required', refund_amount:0, manual_checks:['特別企画乗車券の発売条件を確認してください。']};
    if (type === 'standing_express' && request.departed) return {status:'not_eligible', refund_amount:0, reason:'立席特急券は乗車列車の出発時刻後です。'};
    if (type === 'seat_unassigned' && request.travel_date_started) return {status:'not_eligible', refund_amount:0, reason:'座席未指定券は使用開始日を過ぎています。'};

    let fee;
    let feeBase = face;
    if (['reserved_express','reserved_green','sleeper','reserved_seat'].includes(type)) {
      const rule = this.rules.reservedFeeRule(request.days_before_departure);
      if (!rule) return {status:'insufficient_input', refund_amount:0, reason:'列車出発日までの日数が必要です。'};
      if (rule.method === 'fixed') fee = rule.fee;
      else {
        feeBase = ['reserved_green','sleeper','reserved_seat'].includes(type)
          ? requiredNumber(request, 'facility_charge')
          : face;
        fee = Math.max(rule.minimum, this.rounding.floor10(feeBase * rule.rate));
      }
    } else {
      fee = this.rules.feeFor(type);
      if (fee == null) return {status:'rule_data_missing', refund_amount:0, reason:`${type}の払戻手数料がありません。`};
    }
    const refund = Math.max(0, this.rounding.nonNegativeYen(face) - fee);
    return {status:'calculated', handling_type:'passenger_before_travel_refund', refund_amount:refund, refund_fee:fee, fee_base:feeBase, additional_collection:0, formula:`${face}円－${fee}円＝${refund}円`};
  }
}

export class AfterTravelRefundService {
  constructor({rules = new RefundRuleServiceV6(), fareEngine = null} = {}) { this.rules = rules; this.fareEngine = fareEngine; }
  calculate(request) {
    const unusedKm = requiredNumber(request, 'unused_business_km');
    if (unusedKm < this.rules.minimumUnusedBusinessKm()) return {status:'not_eligible', refund_amount:0, reason:`不乗区間の営業キロが${this.rules.minimumUnusedBusinessKm()}km未満です。`};
    if (!this.fareEngine?.calculateUsedSectionFare) return {status:'manual_confirmation_required', refund_amount:0, reason:'既乗区間運賃をFareEngineから取得できません。'};
    const used = this.fareEngine.calculateUsedSectionFare(request);
    if (!used || !Number.isFinite(Number(used.amount_yen))) return {status:'calculation_error', refund_amount:0, reason:'FareEngineによる既乗区間運賃計算に失敗しました。'};
    const face = requiredNumber(request, 'face_value');
    const fee = this.rules.feeFor(request.ticket_type === 'discount_ordinary' ? 'discount_ordinary' : 'ordinary');
    const refund = Math.max(0, Math.trunc(face) - Math.trunc(used.amount_yen) - fee);
    return {status:'calculated', handling_type:'passenger_after_travel_refund', refund_amount:refund, refund_fee:fee, used_section_fare:Math.trunc(used.amount_yen), used_section_fare_source:'FareEngine', discount_re_evaluated:Boolean(used.discount_re_evaluated), additional_collection:0, formula:`${face}円－${Math.trunc(used.amount_yen)}円－${fee}円＝${refund}円`};
  }
}

export class CommuterPassRefundService {
  constructor({rules = new RefundRuleServiceV6(), rounding = new RefundRoundingServiceV6()} = {}) { this.rules = rules; this.rounding = rounding; }
  calculate(request) {
    const face = requiredNumber(request, 'face_value');
    const fee = this.rules.commuterRule().fixed_fee;
    if (request.travel_state === 'before_travel' || request.before_validity_start) {
      const refund = Math.max(0, face - fee);
      return {status:'calculated', handling_type:'passenger_commuter_refund', selected_method:'before_start', refund_amount:refund, refund_fee:fee, formula:`${face}円－${fee}円＝${refund}円`};
    }
    const oneWay = requiredNumber(request, 'one_way_fare');
    const elapsedDays = requiredNumber(request, 'elapsed_days');
    const monthlyFare = requiredNumber(request, 'one_month_commuter_fare');
    const normalUsed = Math.min(monthlyFare, oneWay * this.rules.commuterRule().daily_round_trips * elapsedDays);
    const normalRefund = Math.max(0, face - normalUsed - fee);
    const periodFare = requiredNumber(request, 'period_fare');
    const elapsedPeriods = requiredNumber(request, 'elapsed_periods');
    const periodRefund = Math.max(0, face - periodFare * elapsedPeriods - fee);
    const selected = periodRefund > normalRefund ? 'period_calculation' : 'normal_calculation';
    const refund = Math.max(normalRefund, periodRefund);
    return {status:'calculated', handling_type:'passenger_commuter_refund', selected_method:selected, comparison_reason:`通常計算${normalRefund}円と旬割計算${periodRefund}円を比較し、多い方を採用しました。`, normal_calculation:{used_amount:normalUsed,refund_amount:normalRefund}, period_calculation:{used_amount:periodFare*elapsedPeriods,refund_amount:periodRefund}, refund_amount:refund, refund_fee:fee, additional_collection:0};
  }
}

export class CouponTicketRefundService {
  constructor({rules = new RefundRuleServiceV6()} = {}) { this.rules = rules; }
  calculate(request) {
    const face = requiredNumber(request, 'face_value');
    const total = requiredNumber(request, 'total_sheets');
    const remaining = requiredNumber(request, 'remaining_sheets');
    if (total <= 0 || remaining > total) throw Object.assign(new Error('回数券の枚数が不正です。'), {name:'ValidationError', code:'INVALID_COUPON_SHEETS'});
    const used = total - remaining;
    const fee = this.rules.couponRule().fixed_fee;
    if (used === 0) {
      const refund = Math.max(0, face - fee);
      return {status:'calculated', handling_type:'passenger_coupon_refund', used_sheets:0, refund_amount:refund, refund_fee:fee, formula:`${face}円－${fee}円＝${refund}円`};
    }
    const singleFare = requiredNumber(request, 'coupon_section_single_fare');
    const refund = Math.max(0, face - singleFare * used - fee);
    return {status:'calculated', handling_type:'passenger_coupon_refund', used_sheets:used, remaining_sheets:remaining, deduction_amount:singleFare*used, refund_amount:refund, refund_fee:fee, additional_collection:0, formula:`${face}円－${singleFare}円×${used}枚－${fee}円＝${refund}円`};
  }
}
