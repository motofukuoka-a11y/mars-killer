import rules from '../../data/rules/refund_rules_v6.json' with {type: 'json'};

export default class RefundRuleServiceV6 {
  constructor(master = rules) { this.master = master; }
  feeFor(ticketType) { return this.master.fees?.[ticketType] ?? null; }
  reservedFeeRule(daysBeforeDeparture) {
    if (!Number.isFinite(Number(daysBeforeDeparture))) return null;
    return Number(daysBeforeDeparture) >= 2
      ? this.master.reserved.two_days_before_or_earlier
      : this.master.reserved.day_before_to_departure;
  }
  minimumUnusedBusinessKm() { return this.master.after_travel.minimum_unused_business_km; }
  commuterRule() { return this.master.commuter; }
  couponRule() { return this.master.coupon; }
}
