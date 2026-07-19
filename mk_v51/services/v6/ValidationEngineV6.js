import {BusinessMode, RefundStage, AccidentTiming} from './Version6Models.js';

const MODES=new Set(Object.values(BusinessMode));
const REFUND_STAGES=new Set(Object.values(RefundStage));
const ACCIDENT_TIMINGS=new Set(Object.values(AccidentTiming));
const RESERVED_TYPES=new Set(['reserved_express','reserved_green','sleeper','reserved_seat']);
const FACILITY_TYPES=new Set(['reserved_green','sleeper','reserved_seat']);
const issue=(code,field,message)=>({code,field,message});

export default class ValidationEngineV6 {
  validate(input={}) {
    const errors=[]; const warnings=[];
    if (!MODES.has(input.mode)) errors.push(issue('MODE_REQUIRED','mode','有効な業務モードを指定してください。'));
    if (input.mode===BusinessMode.PASSENGER_REFUND) this.validatePassengerRefund(input,errors,warnings);
    if (input.mode===BusinessMode.ACCIDENT_HANDLING) {
      if (!ACCIDENT_TIMINGS.has(input.accident_timing)) errors.push(issue('ACCIDENT_TIMING_REQUIRED','accident_timing','事故発生時点を指定してください。'));
      if (input.delay_minutes!=null) this.validateNonNegativeNumber(input,['delay_minutes'],errors);
    }
    return {isValid:errors.length===0,errors,warnings};
  }

  validatePassengerRefund(input,errors,warnings) {
    if (!REFUND_STAGES.has(input.refund_stage)) errors.push(issue('REFUND_STAGE_REQUIRED','refund_stage','旅行開始前または旅行開始後を指定してください。'));
    if (!input.ticket_type) errors.push(issue('TICKET_TYPE_REQUIRED','ticket_type','券種を指定してください。'));
    this.requireMoney(input,'face_value_yen',errors);

    if (input.ticket_type==='commuter_pass') {
      if (input.refund_stage===RefundStage.AFTER_TRAVEL_START && input.before_validity_start!==true) {
        ['one_way_fare_yen','elapsed_days','one_month_commuter_fare_yen','period_fare_yen','elapsed_periods'].forEach(field=>this.requireNonNegative(input,field,errors));
      }
      return;
    }
    if (input.ticket_type==='coupon_ticket') {
      ['total_sheets','remaining_sheets'].forEach(field=>this.requireNonNegative(input,field,errors,true));
      if (Number(input.total_sheets)===0) errors.push(issue('INVALID_COUPON_TOTAL','total_sheets','総券片数は1以上で指定してください。'));
      if (Number(input.remaining_sheets)>Number(input.total_sheets)) errors.push(issue('INVALID_COUPON_SHEETS','remaining_sheets','残余枚数は総券片数以下で指定してください。'));
      if (Number(input.remaining_sheets)<Number(input.total_sheets)) this.requireMoney(input,'coupon_section_single_fare_yen',errors);
      return;
    }

    if (input.refund_stage===RefundStage.AFTER_TRAVEL_START) this.requireNonNegative(input,'unused_business_km',errors,false);
    if (input.refund_stage===RefundStage.BEFORE_TRAVEL && RESERVED_TYPES.has(input.ticket_type)) {
      this.requireNonNegative(input,'days_before_departure',errors,true);
      if (FACILITY_TYPES.has(input.ticket_type) && Number(input.days_before_departure)<2) this.requireMoney(input,'facility_charge_yen',errors);
    }
    if (input.ticket_type==='standing_express' && input.departure_time_passed==null) warnings.push(issue('DEPARTURE_STATUS_RECOMMENDED','departure_time_passed','乗車列車の出発時刻前後を確認してください。'));
    if (input.ticket_type==='seat_unassigned' && input.travel_date_started==null) warnings.push(issue('TRAVEL_DATE_STATUS_RECOMMENDED','travel_date_started','使用開始日前後を確認してください。'));
  }

  requireMoney(input,field,errors) {
    if (input[field]==null || input[field]==='') { errors.push(issue('REQUIRED_MONEY',field,`${field}を指定してください。`)); return; }
    const value=Number(input[field]);
    if (!Number.isFinite(value)||value<0||!Number.isInteger(value)) errors.push(issue('INVALID_MONEY',field,`${field}は0以上の整数で指定してください。`));
  }
  requireNonNegative(input,field,errors,integer=false) {
    if (input[field]==null || input[field]==='') { errors.push(issue('REQUIRED_NUMBER',field,`${field}を指定してください。`)); return; }
    const value=Number(input[field]);
    if (!Number.isFinite(value)||value<0||(integer&&!Number.isInteger(value))) errors.push(issue('INVALID_NUMBER',field,`${field}は0以上${integer?'の整数':''}で指定してください。`));
  }
  validateNonNegativeNumber(input,fields,errors) { for (const field of fields) if (input[field]!=null) this.requireNonNegative(input,field,errors,false); }
}
