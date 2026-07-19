export default class ResultBuilderV6 {
  build({calculation, resolved, warnings = [], debug_information = null}) {
    return {
      result: calculation,
      formula: calculation.formula || null,
      rule_name: resolved.selected_rule,
      warnings,
      manual_checks: calculation.manual_checks || [],
      debug_information
    };
  }
}
