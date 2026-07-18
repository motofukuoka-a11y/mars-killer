/**
 * RefundEngine
 *
 * 普通乗車券および特急券の払戻し計算を担当する。
 * 手数料・払戻可否・判定時点はrefund_rules.jsonから取得する。
 */
export const RefundStatus = Object.freeze({
  BEFORE_TRIP: 'before_trip',
  AFTER_TRIP_START: 'after_trip_start',
  BEFORE_TRAIN_DEPARTURE: 'before_train_departure',
  AFTER_TRAIN_DEPARTURE: 'after_train_departure',
  AFTER_USE_START: 'after_use_start',
  JOURNEY_ABANDONED: 'journey_abandoned'
});

export default class RefundEngine {

  static TICKET_TYPES = Object.freeze({
    ORDINARY: 'ordinary',
    LIMITED_EXPRESS: 'limited_express'
  });

  static RefundStatus = RefundStatus;

  static ERROR_CODES = Object.freeze({
    INVALID_REFUND_REQUEST: 'INVALID_REFUND_REQUEST',
    UNSUPPORTED_REFUND_TICKET:
      'UNSUPPORTED_REFUND_TICKET',
    REFUND_RULE_NOT_FOUND: 'REFUND_RULE_NOT_FOUND'
  });

  constructor(rules = []) {
    this.rules = rules;
  }

  /**
   * 払戻しを計算する。
   */
  calculate(options = {}) {
    const input = this.normalizeInput(options);
    const rule = this.findRule(
      input.ticketType,
      input.status
    );

    const amount = this.resolveRefundTargetAmount(
      input,
      rule
    );

    if (!rule.refundable) {
      return this.notRefundableResult({
        input,
        rule,
        amount
      });
    }

    if (
      rule.requires_unused_amount &&
      input.unusedAmountYen == null
    ) {
      return this.notRefundableResult({
        input,
        rule,
        amount,
        reason:
          '使用開始後の払戻しには未使用区間の払戻対象額が必要です。'
      });
    }

    if (
      rule.minimum_remaining_km != null &&
      !this.meetsRemainingDistanceCondition(
        input.remainingBusinessKm,
        rule
      )
    ) {
      const operator =
        rule.minimum_remaining_km_inclusive
          ? '以上'
          : '超';

      return this.notRefundableResult({
        input,
        rule,
        amount,
        reason:
          `未使用区間が${rule.minimum_remaining_km}km${operator}の条件を満たしません。`
      });
    }

    const fee = this.calculateFee(rule, amount);
    const afterFee = Math.max(amount - fee, 0);

    if (
      rule.require_positive_after_fee &&
      afterFee <= 0
    ) {
      return this.notRefundableResult({
        input,
        rule,
        amount,
        fee,
        reason:
          '払戻対象額が手数料以下のため、払戻額がありません。'
      });
    }

    return {
      refundable: true,
      refund_target: this.refundTargetName(
        input.ticketType
      ),
      ticket_type: input.ticketType,
      status: input.status,
      refund_before_fee_yen: amount,
      fee_yen: fee,
      refund_after_fee_yen: afterFee,
      non_refundable_reason: null,
      reason: rule.reason,
      calculation_basis: {
        rule_id: rule.rule_id,
        amount_source:
          this.amountSource(input, rule),
        original_amount_yen:
          input.amountYen,
        unused_amount_yen:
          input.unusedAmountYen,
        remaining_business_km:
          input.remainingBusinessKm,
        fee_mode: rule.fee.mode,
        fee_value: rule.fee.value,
        formula:
          `${amount}円 - ${fee}円 = ${afterFee}円`
      }
    };
  }

  normalizeInput(options) {
    const ticketType = options.ticketType;

    this.validateEnum(
      ticketType,
      Object.values(RefundEngine.TICKET_TYPES),
      '払戻対象'
    );

    const status = this.resolveStatus(
      ticketType,
      options.status
    );

    const amountYen = this.validateAmount(
      options.amountYen,
      '払戻前金額'
    );

    const unusedAmountYen =
      options.unusedAmountYen == null
        ? null
        : this.validateAmount(
            options.unusedAmountYen,
            '未使用区間金額'
          );

    const remainingBusinessKm =
      options.remainingBusinessKm == null
        ? null
        : this.validateDistance(
            options.remainingBusinessKm
          );

    return {
      ...options,
      ticketType,
      status,
      amountYen,
      unusedAmountYen,
      remainingBusinessKm
    };
  }

  resolveStatus(ticketType, status) {
    if (!status) {
      throw this.createError(
        RefundEngine.ERROR_CODES.INVALID_REFUND_REQUEST,
        '払戻し判定状態をstatusで指定してください。',
        {
          field: 'status',
          ticket_type: ticketType
        }
      );
    }

    const ticketRule = this.rules.find(
      item =>
        item.ticket_type === ticketType &&
        Array.isArray(item.allowed_status)
    );

    if (!ticketRule) {
      throw this.createError(
        RefundEngine.ERROR_CODES.REFUND_RULE_NOT_FOUND,
        `券種ごとの許可状態定義がありません: ${ticketType}`,
        {
          ticket_type: ticketType
        }
      );
    }

    this.validateEnum(
      status,
      ticketRule.allowed_status,
      '払戻し判定状態'
    );

    return status;
  }

  findRule(ticketType, status) {

    const rule = this.rules.find(item =>
      item.ticket_type === ticketType &&
      item.status === status
    );

    if (!rule) {
      throw this.createError(
        RefundEngine.ERROR_CODES.REFUND_RULE_NOT_FOUND,
        `払戻規則がありません: ${ticketType}/${status}`,
        {
          ticket_type: ticketType,
          status
        }
      );
    }

    return rule;
  }

  resolveRefundTargetAmount(input, rule) {
    if (rule.amount_source === 'unused_amount') {
      return input.unusedAmountYen ?? 0;
    }

    return input.amountYen;
  }

  calculateFee(rule, amount) {
    if (!rule.fee) {
      return 0;
    }

    if (rule.fee.mode === 'fixed') {
      return Number(rule.fee.value);
    }

    if (rule.fee.mode === 'rate') {
      return Math.max(
        Math.floor(
          amount * Number(rule.fee.value)
        ),
        Number(rule.fee.minimum || 0)
      );
    }

    throw this.createError(
      RefundEngine.ERROR_CODES.INVALID_REFUND_REQUEST,
      `未対応の手数料方式です: ${rule.fee.mode}`,
      {
        rule_id: rule.rule_id,
        fee_mode: rule.fee.mode
      }
    );
  }

  meetsRemainingDistanceCondition(
    remainingBusinessKm,
    rule
  ) {
    if (remainingBusinessKm == null) {
      return false;
    }

    const remaining = Number(remainingBusinessKm);
    const threshold =
      Number(rule.minimum_remaining_km);

    return rule.minimum_remaining_km_inclusive
      ? remaining >= threshold
      : remaining > threshold;
  }

  notRefundableResult({
    input,
    rule,
    amount,
    fee = 0,
    reason = null
  }) {
    return {
      refundable: false,
      refund_target: this.refundTargetName(
        input.ticketType
      ),
      ticket_type: input.ticketType,
      status: input.status,
      refund_before_fee_yen: amount,
      fee_yen: fee,
      refund_after_fee_yen: 0,
      non_refundable_reason:
        reason || rule.non_refundable_reason,
      reason: rule.reason,
      calculation_basis: {
        rule_id: rule.rule_id,
        amount_source:
          this.amountSource(input, rule),
        original_amount_yen:
          input.amountYen,
        unused_amount_yen:
          input.unusedAmountYen,
        remaining_business_km:
          input.remainingBusinessKm,
        determination: 'not_refundable'
      }
    };
  }

  amountSource(input, rule) {
    return rule.amount_source === 'unused_amount'
      ? 'unusedAmountYen'
      : 'amountYen';
  }

  refundTargetName(ticketType) {
    const names = {
      [RefundEngine.TICKET_TYPES.ORDINARY]:
        '普通乗車券',
      [RefundEngine.TICKET_TYPES.LIMITED_EXPRESS]:
        '特急券'
    };

    return names[ticketType];
  }

  validateAmount(value, label) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      throw this.createError(
        RefundEngine.ERROR_CODES.INVALID_REFUND_REQUEST,
        `${label}が不正です: ${value}`,
        {
          label,
          value
        }
      );
    }

    return number;
  }

  validateDistance(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      throw this.createError(
        RefundEngine.ERROR_CODES.INVALID_REFUND_REQUEST,
        `未使用区間の営業キロが不正です: ${value}`,
        { value }
      );
    }

    return number;
  }

  validateEnum(value, allowed, label) {
    if (!allowed.includes(value)) {
      throw this.createError(
        RefundEngine.ERROR_CODES
          .UNSUPPORTED_REFUND_TICKET,
        `${label}が不正です: ${value}`,
        {
          value,
          allowed
        }
      );
    }
  }

  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  }
}
