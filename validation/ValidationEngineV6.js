export default class ValidationEngineV6 {
  validate(request = {}) {
    const errors = [];
    const warnings = [];
    const required = ['business_mode','ticket_type','travel_state'];
    for (const field of required) if (request[field] === undefined || request[field] === null || request[field] === '') errors.push({field,code:'REQUIRED',message:`${field}は必須です。`});
    const numericFields = ['business_km','refund_amount','delay_minutes','face_value','unused_business_km','facility_charge','one_way_fare','elapsed_days','one_month_commuter_fare','period_fare','elapsed_periods','total_sheets','remaining_sheets','coupon_section_single_fare','fare_amount','charge_amount','original_fare','actual_fare','original_charge','actual_charge','original_facility','actual_facility','suspension_days','daily_split_fare','unused_conversion_km','current_express_charge','express_charge'];
    for (const field of numericFields) if (request[field] !== undefined && (!Number.isFinite(Number(request[field])) || Number(request[field]) < 0)) errors.push({field,code:'RANGE',message:`${field}は0以上の数値で入力してください。`});
    if (request.start_date && request.end_date && new Date(request.start_date) > new Date(request.end_date)) errors.push({field:'date_range',code:'INCONSISTENT',message:'開始日は終了日以前でなければなりません。'});
    if (request.travel_state === 'before_travel' && request.current_station) errors.push({field:'current_station',code:'INCONSISTENT',message:'旅行開始前に途中駅は入力できません。'});
    if (request.ticket_type === 'coupon_ticket') {
      if (request.total_sheets !== undefined && Number(request.total_sheets) <= 0) errors.push({field:'total_sheets',code:'RANGE',message:'総枚数は1枚以上でなければなりません。'});
      if (Number(request.remaining_sheets) > Number(request.total_sheets)) errors.push({field:'remaining_sheets',code:'INCONSISTENT',message:'残余枚数は総枚数以下でなければなりません。'});
    }
    if (request.business_mode === 'accident_handling' && !request.incident_type) errors.push({field:'incident_type',code:'REQUIRED',message:'事故区分は必須です。'});
    if (request.business_mode === 'passenger_refund' && request.ticket_type !== 'commuter_pass' && request.face_value === undefined) errors.push({field:'face_value',code:'REQUIRED',message:'券面金額は必須です。'});
    if (request.business_mode === 'passenger_refund' && request.ticket_type === 'commuter_pass' && request.travel_state !== 'before_travel') {
      for (const field of ['face_value','one_way_fare','elapsed_days','one_month_commuter_fare','period_fare','elapsed_periods']) if (request[field] === undefined) errors.push({field,code:'REQUIRED',message:`${field}は必須です。`});
    }
    if (request.business_mode === 'passenger_refund' && request.ticket_type === 'coupon_ticket') {
      for (const field of ['face_value','total_sheets','remaining_sheets']) if (request[field] === undefined) errors.push({field,code:'REQUIRED',message:`${field}は必須です。`});
      if (Number(request.remaining_sheets) < Number(request.total_sheets) && request.coupon_section_single_fare === undefined) errors.push({field:'coupon_section_single_fare',code:'REQUIRED',message:'一部使用時は券面区間の片道普通運賃が必要です。'});
    }

    if (request.business_mode === 'accident_handling') {
      if (request.incident_type === 'return_transport' || request.selected_candidate === 'free_return') {
        if (!request.origin) errors.push({field:'origin',code:'REQUIRED',message:'発駅は必須です。'});
        if (!request.return_station) errors.push({field:'return_station',code:'REQUIRED',message:'送還駅は必須です。'});
      }
      if (request.incident_type === 'alternate_route' || request.selected_candidate === 'alternative_route') {
        for (const field of ['alternative_route','original_fare','actual_fare']) if (request[field] === undefined || request[field] === '') errors.push({field,code:'REQUIRED',message:`${field}は必須です。`});
      }
      if (request.incident_type === 'commuter_accident') {
        for (const field of ['suspension_days','daily_split_fare']) if (request[field] === undefined) errors.push({field,code:'REQUIRED',message:`${field}は必須です。`});
      }
      if (request.incident_type === 'coupon_accident') {
        for (const field of ['suspension_days','coupon_section_single_fare','remaining_sheets','total_sheets']) if (request[field] === undefined) errors.push({field,code:'REQUIRED',message:`${field}は必須です。`});
      }
    }
    return {status:errors.length?'invalid':'valid',errors,warnings};
  }
}
