export const BusinessMode = Object.freeze({
  NORMAL: 'normal_calculation',
  PASSENGER_REFUND: 'passenger_refund',
  ACCIDENT: 'accident_handling'
});

export const ResultStatus = Object.freeze({
  CALCULATED: 'calculated',
  NOT_ELIGIBLE: 'not_eligible',
  INSUFFICIENT_INPUT: 'insufficient_input',
  MANUAL_CONFIRMATION_REQUIRED: 'manual_confirmation_required',
  RULE_DATA_MISSING: 'rule_data_missing',
  MULTIPLE_CHOICES_AVAILABLE: 'multiple_choices_available',
  CALCULATION_ERROR: 'calculation_error'
});

export function businessDecision(values = {}) {
  return {
    ticket_type: values.ticket_type ?? null,
    travel_state: values.travel_state ?? null,
    refund_type: values.refund_type ?? null,
    incident_type: values.incident_type ?? null,
    candidate_list: Array.isArray(values.candidate_list) ? values.candidate_list : [],
    manual_confirmation: Boolean(values.manual_confirmation)
  };
}

export function resolvedRule(values = {}) {
  return {
    selected_rule: values.selected_rule ?? null,
    rejected_rules: Array.isArray(values.rejected_rules) ? values.rejected_rules : [],
    manual_confirmation: Boolean(values.manual_confirmation),
    reason: values.reason ?? ''
  };
}
