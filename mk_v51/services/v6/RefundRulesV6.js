export const REFUND_RULES_V6 = Object.freeze({
  version: '6.0.0',
  currency: 'JPY',
  fees: Object.freeze({
    ordinary: 220,
    round_trip: 220,
    continuous: 220,
    discount_ordinary: 220,
    commuter_pass: 220,
    coupon_ticket: 220,
    unreserved_express: 220,
    standing_express: 220,
    seat_unassigned: 340
  }),
  reserved: Object.freeze({
    two_days_before_or_earlier: Object.freeze({method:'fixed', fee_yen:340}),
    day_before_to_departure: Object.freeze({method:'percentage', rate:0.30, minimum_yen:340, rounding:'floor_10'})
  }),
  after_travel: Object.freeze({minimum_unused_business_km:101, fee_yen:220}),
  commuter_pass: Object.freeze({daily_round_trips:2, fee_yen:220}),
  coupon_ticket: Object.freeze({fee_yen:220})
});

export default REFUND_RULES_V6;
