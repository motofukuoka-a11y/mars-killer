export const BusinessMode = Object.freeze({
  NORMAL_CALCULATION: 'normal_calculation',
  PASSENGER_REFUND: 'passenger_refund',
  ACCIDENT_HANDLING: 'accident_handling'
});

export const ResultStatus = Object.freeze({
  CALCULATED: 'calculated',
  NOT_ELIGIBLE: 'not_eligible',
  MANUAL_CONFIRMATION_REQUIRED: 'manual_confirmation_required',
  INVALID_INPUT: 'invalid_input',
  SYSTEM_ERROR: 'system_error'
});

export const RefundStage = Object.freeze({
  BEFORE_TRAVEL: 'before_travel',
  AFTER_TRAVEL_START: 'after_travel_start'
});

export const AccidentTiming = Object.freeze({
  BEFORE_DEPARTURE: 'before_departure',
  AFTER_DEPARTURE: 'after_departure'
});

export function createCalculationCandidate({id, label, ruleId, service, payload = {}}) {
  if (!id || !label || !ruleId || !service) {
    throw new TypeError('計算候補にはid、label、ruleId、serviceが必要です。');
  }
  return Object.freeze({id, label, rule_id: ruleId, service, payload: {...payload}});
}
