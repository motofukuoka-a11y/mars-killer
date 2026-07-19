export class Version6Error extends Error {
  constructor(message, {code = 'V6_ERROR', category = 'SystemError', retryable = false, details = {}} = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.retryable = Boolean(retryable);
    this.details = details;
  }
}

export class ValidationError extends Version6Error {
  constructor(message, options = {}) {
    super(message, {...options, code: options.code || 'V6_VALIDATION_ERROR', category: 'ValidationError', retryable: false});
  }
}

export class BusinessRuleError extends Version6Error {
  constructor(message, options = {}) {
    super(message, {...options, code: options.code || 'V6_BUSINESS_RULE_ERROR', category: 'BusinessRuleError', retryable: false});
  }
}

export class CalculationError extends Version6Error {
  constructor(message, options = {}) {
    super(message, {...options, code: options.code || 'V6_CALCULATION_ERROR', category: 'CalculationError', retryable: false});
  }
}

export function normalizeVersion6Error(error) {
  if (error instanceof Version6Error) return error;
  return new Version6Error('処理中に予期しないエラーが発生しました。', {
    code: 'V6_UNEXPECTED_ERROR',
    category: 'UnexpectedError',
    retryable: false,
    details: {cause: error?.message || String(error)}
  });
}
