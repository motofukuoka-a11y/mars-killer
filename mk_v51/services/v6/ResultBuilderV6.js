import {ResultStatus} from './Version6Models.js';

const CALCULATION_STATUSES=new Set(Object.values(ResultStatus));

export default class ResultBuilderV6 {
  build({input,validation,resolution,calculation=null,debug=[],elapsed_ms=0}) {
    const calculationStatus=CALCULATION_STATUSES.has(calculation?.status)?calculation.status:null;
    const status=calculationStatus||resolution?.status||(validation?.isValid?ResultStatus.SYSTEM_ERROR:ResultStatus.INVALID_INPUT);
    return {
      version:'6.0.0-development',
      status,
      mode:input?.mode||null,
      validation,
      candidates:resolution?.candidates||[],
      selected_rule:resolution?.selected_candidate?{rule_id:resolution.selected_candidate.rule_id,service:resolution.selected_candidate.service,label:resolution.selected_candidate.label}:null,
      calculation,
      manual_confirmation_required:status===ResultStatus.MANUAL_CONFIRMATION_REQUIRED,
      elapsed_ms,
      debug
    };
  }
}
