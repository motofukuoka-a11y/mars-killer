const ERROR_TYPES = new Set(['ValidationError','BusinessRuleError','CalculationError','SystemError','UnexpectedError']);
const RETRYABLE_CODES = new Set(['NETWORK_ERROR','TIMEOUT','SERVICE_UNAVAILABLE']);

export default class ErrorHandlingV6 {
  classify(error) {
    if (ERROR_TYPES.has(error?.name)) return error.name;
    if (error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError) return 'SystemError';
    return 'UnexpectedError';
  }
  toResult(error, service_name = 'unknown') {
    const error_type = this.classify(error);
    const error_code = error?.code || this.defaultCode(error_type);
    return {
      error_code,
      error_type,
      message: this.publicMessage(error_type),
      service_name,
      timestamp: new Date().toISOString(),
      retryable: RETRYABLE_CODES.has(error_code)
    };
  }
  defaultCode(type) {
    return ({ValidationError:'VALIDATION_FAILED',BusinessRuleError:'BUSINESS_RULE_FAILED',CalculationError:'CALCULATION_FAILED',SystemError:'SYSTEM_ERROR',UnexpectedError:'UNEXPECTED_ERROR'})[type];
  }
  publicMessage(type) {
    if (type === 'ValidationError') return '入力内容を確認してください。';
    if (type === 'BusinessRuleError') return '適用可能な取扱いを確認できませんでした。';
    if (type === 'CalculationError') return '計算処理に失敗しました。入力内容と適用規則を確認してください。';
    return '処理中にエラーが発生しました。時間をおいて再度お試しください。';
  }
}
