import {
  BeforeTravelRefundService,
  AfterTravelRefundService,
  CommuterPassRefundService,
  CouponTicketRefundService
} from './PassengerRefundServicesV6.js';
import {
  AccidentRefundService,
  AccidentChangeService,
  TravelDiscontinuationService,
  DelayRefundService,
  ExpressContinuationService,
  FreeReturnService,
  AlternativeRouteService,
  AccidentCommuterService,
  AccidentCouponService
} from './AccidentHandlingServicesV6.js';

export default class CalculationServiceRouterV6 {
  constructor({fareEngine = null} = {}) {
    this.beforeTravel = new BeforeTravelRefundService();
    this.afterTravel = new AfterTravelRefundService({fareEngine});
    this.commuter = new CommuterPassRefundService();
    this.coupon = new CouponTicketRefundService();
    this.accidentRefund = new AccidentRefundService();
    this.accidentChange = new AccidentChangeService();
    this.travelDiscontinuation = new TravelDiscontinuationService({fareEngine});
    this.delayRefund = new DelayRefundService();
    this.expressContinuation = new ExpressContinuationService();
    this.freeReturn = new FreeReturnService();
    this.alternativeRoute = new AlternativeRouteService();
    this.accidentCommuter = new AccidentCommuterService();
    this.accidentCoupon = new AccidentCouponService();
  }
  serviceName(rule) {
    const names = {
      passenger_before_travel_refund:'BeforeTravelRefundService',
      passenger_after_travel_refund:'AfterTravelRefundService',
      passenger_commuter_refund:'CommuterPassRefundService',
      passenger_coupon_refund:'CouponTicketRefundService',
      accident_full_refund:'AccidentRefundService',
      accident_train_change:'AccidentChangeService',
      later_travel:'AccidentChangeService',
      travel_discontinuation:'TravelDiscontinuationService',
      delay_refund:'DelayRefundService',
      express_continuation:'ExpressContinuationService',
      free_return:'FreeReturnService',
      alternative_route:'AlternativeRouteService',
      accident_commuter:'AccidentCommuterService',
      accident_coupon:'AccidentCouponService'
    };
    return names[rule] || 'UnknownCalculationService';
  }
  calculate(resolved, request) {
    const rule = resolved.selected_rule;
    if (!rule) return {status:'manual_confirmation_required',refund_amount:0};
    const routes = {
      passenger_before_travel_refund:this.beforeTravel,
      passenger_after_travel_refund:this.afterTravel,
      passenger_commuter_refund:this.commuter,
      passenger_coupon_refund:this.coupon,
      accident_full_refund:this.accidentRefund,
      accident_train_change:this.accidentChange,
      later_travel:this.accidentChange,
      travel_discontinuation:this.travelDiscontinuation,
      delay_refund:this.delayRefund,
      express_continuation:this.expressContinuation,
      free_return:this.freeReturn,
      alternative_route:this.alternativeRoute,
      accident_commuter:this.accidentCommuter,
      accident_coupon:this.accidentCoupon
    };
    const service = routes[rule];
    if (!service) throw Object.assign(new Error(`未対応の規則です: ${rule}`), {name:'CalculationError',code:'UNSUPPORTED_RULE'});
    return service.calculate(request);
  }
}
