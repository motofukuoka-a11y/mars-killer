const RULE_STATUS = Object.freeze({
  CANDIDATE: 'candidate',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected'
});

const DISCOUNT_TITLES = Object.freeze({
  none: '普通旅客運賃',
  student: '学生割引',
  disability_type1: '障害者1種割引',
  disability_type2: '障害者2種割引',
  round_trip: '往復割引',
  group: '団体割引',
  other: 'その他割引',
  assistant_normal: '通常介助者',
  assistant_type1: '障害者1種介助者割引',
  assistant_type2: '障害者2種介助者割引'
});

/**
 * 旅客グループ別に営業規則候補と採否理由を組み立てる。
 * 正式な条文番号がマスターにない場合は、架空の条文番号を生成しない。
 */
export default class PassengerRuleService {
  constructor({salesEngine}) {
    this.salesEngine = salesEngine;
  }

  evaluate({passengers = [], calculation = null, context = {}} = {}) {
    const rows = passengers.map(passenger => {
      const calculated = calculation?.passengers?.find(
        row => row.passenger_group_id === passenger.passenger_group_id
      );
      return this.evaluatePassenger(passenger, calculated, context);
    });

    return {
      passengers: rows,
      applied_rule_count: rows.reduce((sum, row) => sum + row.accepted_rules.length, 0)
    };
  }

  evaluatePassenger(passenger, calculated, context) {
    const title = DISCOUNT_TITLES[passenger.discount_type] || passenger.discount_type;
    const discount = calculated?.discount || {};
    const candidates = [];

    candidates.push(this.rule({
      id: 'BASE-ORDINARY-FARE',
      title: '普通旅客運賃の計算',
      status: RULE_STATUS.ACCEPTED,
      reason: '旅客区分に対応する普通運賃マスターを使用しました。',
      source: calculated?.fare?.components?.[0]?.fare_record_id || 'fare_master'
    }));

    if (passenger.discount_type !== 'none' && passenger.discount_type !== 'assistant_normal') {
      const accepted = Boolean(discount.applicable);
      candidates.push(this.rule({
        id: discount.applied?.[0]?.discount_id || discount.discount_type || passenger.discount_type,
        title,
        status: accepted ? RULE_STATUS.ACCEPTED : RULE_STATUS.REJECTED,
        reason: accepted
          ? discount.discount_name || '割引規則の適用条件を満たしました。'
          : discount.discount_name || '正式な適用条件または割引マスターを確認できないため採用していません。',
        source: discount.applied?.[0]?.discount_id || 'discount_rules'
      }));
    }

    if (passenger.age_category === 'assistant') {
      const disabledType = passenger.discount_type === 'assistant_type1'
        ? 'disability_type1'
        : passenger.discount_type === 'assistant_type2'
          ? 'disability_type2'
          : null;
      const pairedCount = disabledType
        ? Number(context.passenger_counts_by_discount?.[disabledType] || 0)
        : 0;
      candidates.push(this.rule({
        id: 'ASSISTANT-PAIRING-CHECK',
        title: '障害者と介助者の組合せ確認',
        status: disabledType && pairedCount > 0 ? RULE_STATUS.ACCEPTED : RULE_STATUS.REJECTED,
        reason: disabledType && pairedCount > 0
          ? `対象となる${DISCOUNT_TITLES[disabledType]}旅客が指定されています。`
          : '対象となる障害者旅客を確認できません。',
        source: 'BusinessEngine context'
      }));
    }

    const acceptedRules = candidates.filter(rule => rule.status === RULE_STATUS.ACCEPTED);
    const rejectedRules = candidates.filter(rule => rule.status === RULE_STATUS.REJECTED);

    return {
      passenger_group_id: passenger.passenger_group_id,
      candidate_rules: candidates,
      accepted_rules: acceptedRules,
      rejected_rules: rejectedRules,
      applied_rules: candidates.map(rule => ({
        rule_no: rule.rule_no,
        rule_title: rule.rule_title,
        result: rule.status === RULE_STATUS.ACCEPTED ? '採用' : '却下',
        reason: rule.reason,
        source: rule.source
      }))
    };
  }

  rule({id, title, status, reason, source}) {
    return {
      rule_no: id || null,
      rule_title: title,
      status,
      reason,
      source
    };
  }
}
