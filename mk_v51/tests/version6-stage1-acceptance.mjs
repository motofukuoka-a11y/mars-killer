import assert from 'node:assert/strict';
import Version6Platform from '../services/v6/Version6Platform.js';
import DebugLoggerV6 from '../services/v6/DebugLoggerV6.js';
import AuditLogV6 from '../services/v6/AuditLogV6.js';
import {BusinessMode, RefundStage, AccidentTiming, ResultStatus} from '../services/v6/Version6Models.js';

const platform = new Version6Platform({debugLogger:new DebugLoggerV6({enabled:true}), auditLog:new AuditLogV6()});

const invalid = await platform.execute({mode:BusinessMode.PASSENGER_REFUND});
assert.equal(invalid.status, ResultStatus.INVALID_INPUT);
assert.equal(invalid.error.category, 'ValidationError');

const under101 = await platform.execute({mode:BusinessMode.PASSENGER_REFUND, refund_stage:RefundStage.AFTER_TRAVEL_START, ticket_type:'ordinary', face_value_yen:3000, unused_business_km:100});
assert.equal(under101.status, ResultStatus.NOT_ELIGIBLE);
assert.equal(under101.selected_rule, null);

const exactly101 = await platform.execute({mode:BusinessMode.PASSENGER_REFUND, refund_stage:RefundStage.AFTER_TRAVEL_START, ticket_type:'ordinary', face_value_yen:3000, unused_business_km:101});
assert.equal(exactly101.status, ResultStatus.MANUAL_CONFIRMATION_REQUIRED);
assert.equal(exactly101.selected_rule.service, 'afterTravelRefund');
assert.equal(exactly101.calculation.status, ResultStatus.MANUAL_CONFIRMATION_REQUIRED);

const delay119 = await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING, accident_timing:AccidentTiming.AFTER_DEPARTURE, delay_minutes:119});
assert.equal(delay119.status, ResultStatus.MANUAL_CONFIRMATION_REQUIRED);
assert.equal(delay119.candidates.some(row=>row.service==='delayRefund'), false);

const delay120 = await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING, accident_timing:AccidentTiming.AFTER_DEPARTURE, delay_minutes:120});
assert.equal(delay120.status, ResultStatus.MANUAL_CONFIRMATION_REQUIRED);
assert.equal(delay120.candidates.some(row=>row.service==='delayRefund'), true);
assert.equal(delay120.selected_rule, null, '複数候補を自動選択しない');

const selected = await platform.execute({mode:BusinessMode.ACCIDENT_HANDLING, accident_timing:AccidentTiming.BEFORE_DEPARTURE, ticket_type:'ordinary', face_value_yen:3000, selected_candidate_id:'accident-full-refund'});
assert.equal(selected.status, ResultStatus.CALCULATED);
assert.equal(selected.selected_rule.rule_id, 'ACCIDENT-BEFORE-FULL-REFUND');

platform.auditLog.record({mode:'x', name:'個人名', address:'住所'});
const lastAudit = platform.auditLog.snapshot().at(-1);
assert.equal('name' in lastAudit, false);
assert.equal('address' in lastAudit, false);
assert.ok(platform.debugLogger.snapshot().length > 0);

console.log('Version 6.0 Stage 1 actual acceptance tests: PASS');
