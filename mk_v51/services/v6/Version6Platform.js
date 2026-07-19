import ValidationEngineV6 from './ValidationEngineV6.js';
import BusinessEngineV6 from './BusinessEngineV6.js';
import RuleResolverV6 from './RuleResolverV6.js';
import ResultBuilderV6 from './ResultBuilderV6.js';
import DebugLoggerV6 from './DebugLoggerV6.js';
import AuditLogV6 from './AuditLogV6.js';
import {ResultStatus} from './Version6Models.js';
import {ValidationError, normalizeVersion6Error} from './Version6Errors.js';
import {BeforeTravelRefundService,AfterTravelRefundService,CommuterPassRefundService,CouponTicketRefundService} from './PassengerRefundServicesV6.js';
import {AccidentFullRefundService,AccidentTrainChangeService,AccidentLaterTravelService,TravelDiscontinuationService,DelayRefundService,ExpressContinuationService,FreeReturnService,AlternativeRouteService,AccidentCommuterService,AccidentCouponService} from './AccidentHandlingServicesV6.js';

export default class Version6Platform {
  constructor({validationEngine=new ValidationEngineV6(),businessEngine=new BusinessEngineV6(),ruleResolver=new RuleResolverV6(),resultBuilder=new ResultBuilderV6(),debugLogger=new DebugLoggerV6(),auditLog=new AuditLogV6(),fareEngine=null,calculationServices={}}={}) {
    const defaults={
      beforeTravelRefund:new BeforeTravelRefundService(),
      afterTravelRefund:new AfterTravelRefundService({fareEngine}),
      commuterPassRefund:new CommuterPassRefundService(),
      couponTicketRefund:new CouponTicketRefundService(),
      accidentFullRefund:new AccidentFullRefundService(),
      accidentTrainChange:new AccidentTrainChangeService(),
      accidentLaterTravel:new AccidentLaterTravelService(),
      travelDiscontinuation:new TravelDiscontinuationService({fareEngine}),
      delayRefund:new DelayRefundService(),
      expressContinuation:new ExpressContinuationService(),
      freeReturn:new FreeReturnService(),
      alternativeRoute:new AlternativeRouteService(),
      accidentCommuter:new AccidentCommuterService(),
      accidentCoupon:new AccidentCouponService()
    };
    Object.assign(this,{validationEngine,businessEngine,ruleResolver,resultBuilder,debugLogger,auditLog,calculationServices:{...defaults,...calculationServices}});
  }

  async execute(input={}) {
    const started=globalThis.performance?.now?.()??Date.now();
    try {
      this.debugLogger.log('ValidationEngine','start');
      const validation=this.validationEngine.validate(input);
      this.debugLogger.log('ValidationEngine','end',{isValid:validation.isValid});
      if (!validation.isValid) throw new ValidationError(validation.errors.map(row=>row.message).join('\n'),{details:{validation}});
      this.debugLogger.log('BusinessEngine','start');
      const business=this.businessEngine.evaluate(input);
      this.debugLogger.log('BusinessEngine','end',{status:business.status,candidate_count:business.candidates.length});
      this.debugLogger.log('RuleResolver','start');
      const resolution=this.ruleResolver.resolve(business,input);
      this.debugLogger.log('RuleResolver','end',{status:resolution.status,service:resolution.selected_candidate?.service??null});
      let calculation=null;
      if (resolution.status===ResultStatus.CALCULATED&&resolution.selected_candidate) {
        const service=this.calculationServices[resolution.selected_candidate.service];
        this.debugLogger.log('CalculationService','start',{service:resolution.selected_candidate.service});
        if (service && typeof service.calculate==='function') calculation=await service.calculate(resolution.selected_candidate.payload);
        else if (typeof service==='function') calculation=await service(resolution.selected_candidate.payload);
        else calculation={status:'not_implemented',service:resolution.selected_candidate.service};
        this.debugLogger.log('CalculationService','end',{service:resolution.selected_candidate.service,status:calculation?.status??null});
      }
      const elapsed=Number(((globalThis.performance?.now?.()??Date.now())-started).toFixed(2));
      const result=this.resultBuilder.build({input,validation,resolution,calculation,debug:this.debugLogger.snapshot(),elapsed_ms:elapsed});
      this.auditLog.record({mode:input.mode,ticket_type:input.ticket_type,refund_stage:input.refund_stage,accident_timing:input.accident_timing,status:result.status,rule_id:result.selected_rule?.rule_id,service:result.selected_rule?.service,result_code:'SUCCESS',elapsed_ms:elapsed});
      return result;
    } catch(error) {
      const normalized=normalizeVersion6Error(error);
      const elapsed=Number(((globalThis.performance?.now?.()??Date.now())-started).toFixed(2));
      this.auditLog.record({mode:input.mode,ticket_type:input.ticket_type,refund_stage:input.refund_stage,accident_timing:input.accident_timing,status:ResultStatus.INVALID_INPUT,result_code:normalized.code,elapsed_ms:elapsed});
      return {version:'6.0.0-development',status:normalized.category==='ValidationError'?ResultStatus.INVALID_INPUT:ResultStatus.SYSTEM_ERROR,error:{code:normalized.code,category:normalized.category,message:normalized.message,retryable:normalized.retryable},elapsed_ms:elapsed,debug:this.debugLogger.snapshot()};
    }
  }
}
