import ValidationEngineV6 from '../../validation/ValidationEngineV6.js';
import BusinessEngineV6 from '../../engines/v6/BusinessEngineV6.js';
import RuleResolverV6 from './RuleResolverV6.js';
import CalculationServiceRouterV6 from './CalculationServicesV6.js';
import ResultBuilderV6 from './ResultBuilderV6.js';
import ErrorHandlingV6 from './ErrorHandlingV6.js';
import {DebugLogger, AuditLog} from '../../debug/Version6Logging.js';

const uuid = () => globalThis.crypto?.randomUUID?.() || `mk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const makeError = (name, code, message, service) => Object.assign(new Error(message), {name, code, service});

export default class Version6Platform {
  constructor({debug = false, fareEngine = null} = {}) {
    this.validation = new ValidationEngineV6();
    this.business = new BusinessEngineV6();
    this.resolver = new RuleResolverV6();
    this.calculation = new CalculationServiceRouterV6({fareEngine});
    this.resultBuilder = new ResultBuilderV6();
    this.errorHandling = new ErrorHandlingV6();
    this.debug = new DebugLogger(debug);
    this.audit = new AuditLog();
  }

  runService(serviceName, action, requestForDebug = null) {
    const token = this.debug.begin(serviceName, requestForDebug);
    try {
      const result = action();
      this.debug.end(token, result);
      return result;
    } catch (error) {
      this.debug.failure(token, error);
      if (!error.service) error.service = serviceName;
      throw error;
    }
  }

  execute(request = {}) {
    const requestId = request.request_id || uuid();
    const overall = this.debug.begin('Version6Platform');
    let selectedRule = null;
    let calculationService = null;
    try {
      const validation = this.runService('ValidationEngine', () => this.validation.validate(request), request);
      if (validation.status !== 'valid') {
        throw makeError('ValidationError','VALIDATION_FAILED',validation.errors.map(row => row.message).join('\n'),'ValidationEngine');
      }

      const decision = this.runService('BusinessEngine', () => this.business.decide(request));
      if (!Array.isArray(decision.candidate_list) || decision.candidate_list.length === 0) {
        throw makeError('BusinessRuleError','NO_CANDIDATE','適用候補がありません。','BusinessEngine');
      }

      const resolved = this.runService('RuleResolver', () => this.resolver.resolve(decision, request));
      selectedRule = resolved.selected_rule;
      if (!selectedRule) {
        const response = this.runService('ResultBuilder', () => this.resultBuilder.build({
          calculation:{status:'multiple_choices_available',refund_amount:0,manual_checks:['取扱いを選択してください。']},
          resolved,
          warnings:[...validation.warnings, resolved.reason].filter(Boolean),
          debug_information:null
        }));
        this.audit.save({request_id:requestId,user_action:request.business_mode,ticket_type:request.ticket_type,selected_rule:null,calculation_service:null,refund_amount:0,manual_confirmation:true,outcome:'manual_confirmation'});
        const timing = this.debug.end(overall, {status:'multiple_choices_available'});
        response.request_id = requestId;
        response.elapsed_ms = timing.elapsed_ms;
        response.debug_information = this.debug.snapshot();
        return response;
      }

      calculationService = this.calculation.serviceName(selectedRule);
      if (calculationService === 'UnknownCalculationService') {
        throw makeError('CalculationError','UNSUPPORTED_RULE',`未対応の規則です: ${selectedRule}`,'CalculationService');
      }
      const calculation = this.runService(calculationService, () => this.calculation.calculate(resolved, request));
      if (!calculation || typeof calculation !== 'object') {
        throw makeError('CalculationError','EMPTY_CALCULATION_RESULT','計算結果が不正です。',calculationService);
      }

      const response = this.runService('ResultBuilder', () => this.resultBuilder.build({
        calculation,
        resolved,
        warnings:validation.warnings,
        debug_information:null
      }));
      this.audit.save({
        request_id:requestId,
        user_action:request.business_mode,
        ticket_type:request.ticket_type,
        selected_rule:selectedRule,
        calculation_service:calculationService,
        refund_amount:calculation.refund_amount || 0,
        manual_confirmation:calculation.status === 'manual_confirmation_required',
        outcome:'success'
      });
      const timing = this.debug.end(overall, {status:'success'});
      response.request_id = requestId;
      response.elapsed_ms = timing.elapsed_ms;
      response.debug_information = this.debug.snapshot();
      return response;
    } catch (error) {
      this.debug.failure(overall, error);
      const errorResult = this.errorHandling.toResult(error, error.service || 'Version6Platform');
      this.audit.save({request_id:requestId,user_action:request.business_mode,ticket_type:request.ticket_type,selected_rule:selectedRule,calculation_service:calculationService,refund_amount:0,manual_confirmation:false,outcome:'error'});
      return {error:errorResult,request_id:requestId,debug_information:this.debug.snapshot()};
    }
  }
}
