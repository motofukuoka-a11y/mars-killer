import assert from 'node:assert/strict';
import Version6Platform from '../services/v6/Version6Platform.js';
import ErrorHandlingV6 from '../services/v6/ErrorHandlingV6.js';
import {AuditLog, DebugLogger} from '../debug/Version6Logging.js';

const validRequest = {
  business_mode:'passenger_refund', ticket_type:'ordinary_ticket', travel_state:'before_travel',
  face_value:1000, request_date:'2026-07-19', start_date:'2026-07-20'
};

// ValidationError and PII-free audit
{
  const platform = new Version6Platform();
  const response = platform.execute({business_mode:'passenger_refund'});
  assert.equal(response.error.error_type,'ValidationError');
  assert.equal(response.error.retryable,false);
  assert.equal(platform.audit.entries.length,1);
}

// Debug is disabled by default and enabled only explicitly
{
  const prod = new Version6Platform();
  const response = prod.execute(validRequest);
  assert.equal(response.debug_information,null);

  const dev = new Version6Platform({debug:true});
  const devResponse = dev.execute(validRequest);
  assert.ok(devResponse.debug_information.some(row => row.service === 'ValidationEngine' && row.phase === 'start'));
  assert.ok(devResponse.debug_information.some(row => row.service === 'BusinessEngine' && row.phase === 'end'));
  assert.ok(devResponse.debug_information.some(row => row.service === 'RuleResolver' && row.phase === 'end'));
  assert.ok(devResponse.debug_information.some(row => row.service === 'BeforeTravelRefundService' && row.phase === 'end'));
  assert.ok(devResponse.debug_information.some(row => row.service === 'ResultBuilder' && row.phase === 'end'));
  assert.ok(dev.debug.performance.entries.every(row => row.elapsed_ms >= 0));
}

// Audit allowlist excludes PII
{
  const log = new AuditLog();
  const entry = log.save({request_id:'r1',timestamp:'2026-07-19T00:00:00.000Z',user_action:'refund',ticket_type:'ordinary_ticket',selected_rule:'r',calculation_service:'s',refund_amount:500,manual_confirmation:false,name:'秘密',phone:'090',address:'北海道'});
  assert.equal('name' in entry,false);
  assert.equal('phone' in entry,false);
  assert.equal('address' in entry,false);
  assert.equal(Object.isFrozen(entry),true);
}

// Error classification and retry policy
{
  const handling = new ErrorHandlingV6();
  const validation = Object.assign(new Error('internal detail'),{name:'ValidationError',code:'VALIDATION_FAILED'});
  const v = handling.toResult(validation,'ValidationEngine');
  assert.equal(v.message,'入力内容を確認してください。');
  assert.equal(v.retryable,false);
  const network = Object.assign(new Error('socket secret'),{name:'SystemError',code:'NETWORK_ERROR'});
  const n = handling.toResult(network,'RemoteService');
  assert.equal(n.retryable,true);
  assert.equal(n.message.includes('socket'),false);
  const unexpected = handling.toResult(new Error('stack secret'),'Unknown');
  assert.equal(unexpected.error_type,'UnexpectedError');
}

// Logger records performance without exposing production debug
{
  const logger = new DebugLogger(false);
  const token = logger.begin('TestService');
  logger.end(token,{ok:true});
  assert.equal(logger.entries.length,0);
  assert.equal(logger.performance.entries.length,1);
}

console.log('Version 6.0 Stage4 common infrastructure acceptance: PASS');
