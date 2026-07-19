import { ErrorCodes } from '../shared/ErrorCodes.js';
import { BusinessOperation, RefundStatus, DepartureStatus } from '../shared/Constants.js';

export default class BusinessEngine {
  constructor({routeEngine,fareEngine,chargeEngine,discountEngine,changeEngine,refundEngine,validationEngine,rules={}}) {
    Object.assign(this,{routeEngine,fareEngine,chargeEngine,discountEngine,changeEngine,refundEngine,validationEngine,rules});
  }
  calculate(input={}) {
    const validation=this.validationEngine.validate({type:'business',...input,businessRules:this.rules});
    if(!validation.valid) return this.failure(input.operation,validation.error_code,validation.message,validation.details);
    const state=this.determineBusinessState(validation.details.requestDate,validation.details.startDate,validation.details.endDate);
    try {
      const result=this.executeOperation(input,this.rules.operations[input.operation],state);
      return {success:true,operation:input.operation,business_state:state,fare:result.fare,calculation:result.calculation,details:result.details,error_code:null,message:null};
    } catch(error) { return this.failure(input.operation,error.code||ErrorCodes.UNSUPPORTED_OPERATION,error.message,error.details||{}); }
  }
  determineBusinessState(requestDate,startDate,endDate) {
    const before=requestDate<startDate;
    return {before_use:before,after_use_start:!before,in_valid_period:requestDate>=startDate&&requestDate<=endDate,expired:requestDate>endDate};
  }
  executeOperation(input,rule,state) {
    switch(input.operation) {
      case BusinessOperation.OVERRUN: return this.executeOverrun(input);
      case BusinessOperation.STOP_CALCULATION: return this.executeFareSection(input,rule,'打切計算');
      case BusinessOperation.SEPARATE_CALCULATION: return this.executeFareSection(input,rule,'別途計算');
      case BusinessOperation.SECTION_CHANGE: return this.executeChange(input,rule,'区間変更');
      case BusinessOperation.ROUTE_CHANGE: return this.executeChange(input,rule,'経路変更');
      case BusinessOperation.ABANDONMENT: return this.executeAbandonment(input,state);
      default: throw this.error(ErrorCodes.INVALID_OPERATION,`未対応の営業実務です: ${input.operation}`);
    }
  }
  executeOverrun(input) {
    const d=this.changeEngine.calculate({type:'overtravel',passenger:input.passenger||'adult',original:this.originalJourney(input),actualGoal:input.actualGoal||input.changed?.goal||input.goal,changed:input.changed||{goal:input.actualGoal||input.goal,via:input.changedVia||[]}});
    const original=Number(d.original_fare_yen||0), additional=Number(d.shortage_yen||0);
    return {fare:{original,additional,refund:0,total:original+additional},calculation:[{engine:'ChangeEngine',operation:'overtravel',amount_yen:additional,reason:d.calculation_reason}],details:d};
  }
  executeFareSection(input,rule,label) {
    const section=input.section||{start:input.currentStation||input.start,goal:input.actualGoal||input.goal,via:input.via||[]};
    const q=this.quoteJourney(section,input.passenger||'adult'), amount=Number(q.fare.amount_yen||0), original=Number(input.originalFareYen||0);
    return {fare:{original,additional:amount,refund:0,total:original+amount},calculation:[{engine:'RouteEngine',operation:rule.calculation_type,section,business_km:q.route.business_km},{engine:'FareEngine',operation:rule.calculation_type,amount_yen:amount,reason:label}],details:q};
  }
  executeChange(input,rule,label) {
    const d=this.changeEngine.calculate({type:rule.change_type,usageState:input.usageState||(input.departureStatus===DepartureStatus.BEFORE_DEPARTURE?'before_use':'after_use'),passenger:input.passenger||'adult',currentStation:input.currentStation,original:this.originalJourney(input),changed:input.changed||{start:input.changedStart||input.start,goal:input.changedGoal||input.goal,via:input.changedVia||[]}});
    const original=Number(d.original_fare_yen||0), additional=Number(d.shortage_yen||0), refund=Number(d.refundable_amount_yen||0);
    return {fare:{original,additional,refund,total:original+additional-refund},calculation:[{engine:'ChangeEngine',operation:rule.change_type,label,additional_yen:additional,refund_yen:refund,reason:d.calculation_reason||d.reason}],details:d};
  }
  executeAbandonment(input,state) {
    const q=this.quoteJourney(this.originalJourney(input),input.passenger||'adult'), original=Number(input.originalFareYen??q.fare.amount_yen);
    const d=this.refundEngine.calculate({ticketType:input.ticketType,status:RefundStatus.JOURNEY_ABANDONED,amountYen:original,unusedAmountYen:Number(input.unusedAmountYen||0),remainingBusinessKm:input.remainingBusinessKm});
    const refund=Number(d.refund_after_fee_yen||0);
    return {fare:{original,additional:0,refund,total:original-refund},calculation:[{engine:'RefundEngine',operation:'abandonment',refundable:d.refundable,refund_yen:refund,reason:d.non_refundable_reason||d.reason}],details:{refund:d,original_quote:q,business_state:state}};
  }
  quoteJourney(j,p){ const route=this.routeEngine.route(j.start,j.goal,j.via||[]); return {route,fare:this.fareEngine.ordinaryFare(route,p)}; }
  originalJourney(input){ return input.original||{start:input.start,goal:input.originalGoal||input.goal,via:input.via||[]}; }
  failure(operation,error_code,message,details={}) { return {success:false,operation:operation||null,business_state:null,fare:{original:0,additional:0,refund:0,total:0},calculation:[],details,error_code,message}; }
  error(code,message,details={}) { const e=new Error(message); e.code=code; e.details=details; return e; }
}
