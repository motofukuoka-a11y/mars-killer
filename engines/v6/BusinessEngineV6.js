import {BusinessMode, businessDecision} from '../../models/Version6Models.js';

export default class BusinessEngineV6 {
  decide(request) {
    const candidates = [];
    if (request.business_mode === BusinessMode.PASSENGER_REFUND) {
      if (request.ticket_type === 'commuter_pass') candidates.push('passenger_commuter_refund');
      else if (request.ticket_type === 'coupon_ticket') candidates.push('passenger_coupon_refund');
      else if (request.travel_state === 'after_travel') candidates.push('passenger_after_travel_refund');
      else candidates.push('passenger_before_travel_refund');
    }
    if (request.business_mode === BusinessMode.ACCIDENT) {
      const map = {
        before_departure: ['accident_full_refund', 'accident_train_change', 'later_travel'],
        after_departure: ['travel_discontinuation', 'express_continuation', 'free_return', 'alternative_route'],
        travel_cancelled: ['travel_discontinuation', 'express_continuation', 'free_return', 'alternative_route'],
        delay: ['delay_refund'],
        accident_change: ['accident_train_change'],
        express_authorization: ['express_continuation'],
        return_transport: ['free_return'],
        alternate_route: ['alternative_route'],
        commuter_accident: ['accident_commuter'],
        coupon_accident: ['accident_coupon']
      };
      candidates.push(...(map[request.incident_type] || []));
    }
    return businessDecision({
      ticket_type: request.ticket_type,
      travel_state: request.travel_state,
      refund_type: request.business_mode === BusinessMode.PASSENGER_REFUND ? request.refund_type || 'passenger' : null,
      incident_type: request.incident_type || null,
      candidate_list: candidates,
      manual_confirmation: candidates.length === 0
    });
  }
}
