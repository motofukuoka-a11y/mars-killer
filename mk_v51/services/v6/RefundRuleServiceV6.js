import REFUND_RULES_V6 from './RefundRulesV6.js';

export default class RefundRuleServiceV6 {
  constructor(master = REFUND_RULES_V6) { this.master = master; }
  feeFor(ticketType) { return this.master.fees?.[ticketType] ?? null; }
  reservedFeeRule(daysBeforeDeparture) {
    const days = Number(daysBeforeDeparture);
    if (!Number.isFinite(days)) return null;
    return days >= 2
      ? this.master.reserved.two_days_before_or_earlier
      : this.master.reserved.day_before_to_departure;
  }
  minimumUnusedBusinessKm() { return this.master.after_travel.minimum_unused_business_km; }
  afterTravelFee() { return this.master.after_travel.fee_yen; }
  commuterRule() { return this.master.commuter_pass; }
  couponRule() { return this.master.coupon_ticket; }
}
