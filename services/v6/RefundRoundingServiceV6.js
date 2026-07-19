export default class RefundRoundingServiceV6 {
  floor10(value) { return Math.floor(Number(value || 0) / 10) * 10; }
  ceil1(value) { return Math.ceil(Number(value || 0)); }
  nonNegativeYen(value) { return Math.max(0, Math.trunc(Number(value || 0))); }
}
