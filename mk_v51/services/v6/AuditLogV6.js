const ALLOWED = new Set(['mode','ticket_type','refund_stage','accident_timing','status','rule_id','service','result_code','elapsed_ms']);
export default class AuditLogV6 {
  constructor({clock = () => new Date().toISOString()} = {}) { this.clock = clock; this.entries = []; }
  record(data = {}) { const safe = {}; for (const [key,value] of Object.entries(data)) if (ALLOWED.has(key)) safe[key]=value; const row={at:this.clock(),...safe}; this.entries.push(row); return row; }
  snapshot() { return this.entries.map(row => ({...row})); }
}
