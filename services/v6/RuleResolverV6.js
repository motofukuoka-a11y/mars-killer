import {resolvedRule} from '../../models/Version6Models.js';

export default class RuleResolverV6 {
  resolve(decision, request) {
    if (!decision.candidate_list.length) return resolvedRule({manual_confirmation: true, reason: '適用候補がありません。'});
    if (decision.candidate_list.length > 1 && request.selected_candidate == null) {
      return resolvedRule({rejected_rules: [], manual_confirmation: true, reason: '複数候補から取扱いを選択してください。'});
    }
    const selected = request.selected_candidate || decision.candidate_list[0];
    return resolvedRule({
      selected_rule: selected,
      rejected_rules: decision.candidate_list.filter(rule => rule !== selected),
      manual_confirmation: false,
      reason: request.selected_candidate ? '利用者が選択した取扱いです。' : '単一候補のため採用しました。'
    });
  }
}
