export default class RefundRoundingServiceV6 {
  floor10(value) { return Math.floor(Number(value) / 10) * 10; }
  yen(value) { return Math.max(0, Math.trunc(Number(value))); }
}
