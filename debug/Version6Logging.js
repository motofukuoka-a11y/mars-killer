const nowIso = () => new Date().toISOString();
const highResolutionNow = () => globalThis.performance?.now?.() ?? Date.now();

export class PerformanceLog {
  constructor() { this.entries = []; }
  start(service_name) {
    return {service_name, start_time: nowIso(), started_at: highResolutionNow()};
  }
  end(token) {
    const end = highResolutionNow();
    const entry = {
      service_name: token.service_name,
      start_time: token.start_time,
      end_time: nowIso(),
      elapsed_ms: Math.round((end - token.started_at) * 1000) / 1000
    };
    this.entries.push(entry);
    return entry;
  }
}

export class DebugLogger {
  constructor(enabled = false) {
    this.enabled = Boolean(enabled);
    this.entries = [];
    this.performance = new PerformanceLog();
  }
  begin(service, request = null) {
    const token = this.performance.start(service);
    if (this.enabled) this.entries.push({service, phase:'start', timestamp:token.start_time, request});
    return token;
  }
  end(token, result = null) {
    const performance = this.performance.end(token);
    if (this.enabled) this.entries.push({service:token.service_name, phase:'end', timestamp:performance.end_time, elapsed_ms:performance.elapsed_ms, result});
    return performance;
  }
  failure(token, error) {
    const performance = this.performance.end(token);
    if (this.enabled) this.entries.push({service:token.service_name, phase:'error', timestamp:performance.end_time, elapsed_ms:performance.elapsed_ms, error:{name:error?.name, code:error?.code}});
    return performance;
  }
  snapshot() { return this.enabled ? structuredClone(this.entries) : null; }
}

export class AuditLog {
  constructor() { this.entries = []; }
  save(entry = {}) {
    const safe = {
      request_id: entry.request_id,
      timestamp: entry.timestamp || nowIso(),
      user_action: entry.user_action,
      ticket_type: entry.ticket_type,
      selected_rule: entry.selected_rule || null,
      calculation_service: entry.calculation_service || null,
      refund_amount: Number(entry.refund_amount || 0),
      manual_confirmation: Boolean(entry.manual_confirmation),
      outcome: entry.outcome || 'success'
    };
    this.entries.push(Object.freeze(safe));
    return safe;
  }
  all() { return [...this.entries]; }
}
