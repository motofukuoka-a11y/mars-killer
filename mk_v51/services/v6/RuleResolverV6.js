import {ResultStatus} from './Version6Models.js';

export default class RuleResolverV6 {
  resolve(businessResult, {selected_candidate_id = null} = {}) {
    const candidates = businessResult.candidates || [];
    if (businessResult.status === ResultStatus.NOT_ELIGIBLE) return {...businessResult, selected_candidate: null};
    if (selected_candidate_id) {
      const selected = candidates.find(row => row.id === selected_candidate_id) || null;
      return selected
        ? {...businessResult, status: ResultStatus.CALCULATED, selected_candidate: selected}
        : {...businessResult, status: ResultStatus.MANUAL_CONFIRMATION_REQUIRED, selected_candidate: null, reason_code: 'SELECTED_CANDIDATE_NOT_FOUND'};
    }
    if (candidates.length === 1) return {...businessResult, status: ResultStatus.CALCULATED, selected_candidate: candidates[0]};
    return {...businessResult, status: ResultStatus.MANUAL_CONFIRMATION_REQUIRED, selected_candidate: null};
  }
}
