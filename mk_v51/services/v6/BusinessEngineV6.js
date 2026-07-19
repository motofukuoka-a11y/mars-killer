import {BusinessMode, RefundStage, AccidentTiming, ResultStatus, createCalculationCandidate} from './Version6Models.js';

export default class BusinessEngineV6 {
  evaluate(input) {
    if (input.mode === BusinessMode.PASSENGER_REFUND) return this.passengerRefund(input);
    if (input.mode === BusinessMode.ACCIDENT_HANDLING) return this.accidentHandling(input);
    return {status:ResultStatus.CALCULATED,candidates:[createCalculationCandidate({id:'normal-calculation',label:'通常計算',ruleId:'NORMAL-CALCULATION',service:'normalCalculation',payload:input})]};
  }

  passengerRefund(input) {
    if (input.ticket_type === 'commuter_pass') {
      return {status:ResultStatus.CALCULATED,candidates:[createCalculationCandidate({id:'commuter-pass-refund',label:'定期乗車券の旅客払戻',ruleId:'PASSENGER-COMMUTER-REFUND',service:'commuterPassRefund',payload:input})]};
    }
    if (input.ticket_type === 'coupon_ticket') {
      return {status:ResultStatus.CALCULATED,candidates:[createCalculationCandidate({id:'coupon-ticket-refund',label:'普通回数乗車券の旅客払戻',ruleId:'PASSENGER-COUPON-REFUND',service:'couponTicketRefund',payload:input})]};
    }
    if (input.refund_stage === RefundStage.AFTER_TRAVEL_START && Number(input.unused_business_km) < 101) {
      return {status:ResultStatus.NOT_ELIGIBLE,reason_code:'UNUSED_SECTION_UNDER_101KM',candidates:[]};
    }
    const before = input.refund_stage === RefundStage.BEFORE_TRAVEL;
    return {status:ResultStatus.CALCULATED,candidates:[createCalculationCandidate({
      id:before?'passenger-refund-before-travel':'passenger-refund-after-start',
      label:before?'旅行開始前の旅客払戻':'旅行開始後の旅客払戻',
      ruleId:before?'PASSENGER-REFUND-BEFORE':'PASSENGER-REFUND-AFTER',
      service:before?'beforeTravelRefund':'afterTravelRefund',
      payload:input
    })]};
  }

  accidentHandling(input) {
    if (input.ticket_type === 'commuter_pass') {
      return {status:ResultStatus.CALCULATED,candidates:[createCalculationCandidate({id:'accident-commuter',label:'事故時定期券払戻',ruleId:'ACCIDENT-COMMUTER-REFUND',service:'accidentCommuter',payload:input})]};
    }
    if (input.ticket_type === 'coupon_ticket') {
      return {status:ResultStatus.CALCULATED,candidates:[createCalculationCandidate({id:'accident-coupon',label:'事故時普通回数券払戻',ruleId:'ACCIDENT-COUPON-REFUND',service:'accidentCoupon',payload:input})]};
    }
    const candidates=[];
    if (input.accident_timing===AccidentTiming.BEFORE_DEPARTURE) {
      candidates.push(
        createCalculationCandidate({id:'accident-full-refund',label:'全額払戻',ruleId:'ACCIDENT-BEFORE-FULL-REFUND',service:'accidentFullRefund',payload:input}),
        createCalculationCandidate({id:'accident-train-change',label:'事故列車変更',ruleId:'ACCIDENT-TRAIN-CHANGE',service:'accidentTrainChange',payload:input}),
        createCalculationCandidate({id:'accident-later-travel',label:'後日の旅行',ruleId:'ACCIDENT-LATER-TRAVEL',service:'accidentLaterTravel',payload:input})
      );
    } else {
      candidates.push(
        createCalculationCandidate({id:'travel-discontinuation',label:'旅行中止',ruleId:'ACCIDENT-TRAVEL-DISCONTINUATION',service:'travelDiscontinuation',payload:input}),
        createCalculationCandidate({id:'express-continuation',label:'急乗承',ruleId:'ACCIDENT-EXPRESS-CONTINUATION',service:'expressContinuation',payload:input}),
        createCalculationCandidate({id:'free-return',label:'無賃送還',ruleId:'ACCIDENT-FREE-RETURN',service:'freeReturn',payload:input}),
        createCalculationCandidate({id:'alternative-route',label:'他経路乗車',ruleId:'ACCIDENT-ALTERNATIVE-ROUTE',service:'alternativeRoute',payload:input})
      );
      if (Number(input.delay_minutes)>=120) candidates.push(createCalculationCandidate({id:'delay-refund',label:'2時間以上遅延の料金払戻',ruleId:'ACCIDENT-DELAY-120',service:'delayRefund',payload:input}));
    }
    return {status:candidates.length>1?ResultStatus.MANUAL_CONFIRMATION_REQUIRED:ResultStatus.CALCULATED,candidates};
  }
}
