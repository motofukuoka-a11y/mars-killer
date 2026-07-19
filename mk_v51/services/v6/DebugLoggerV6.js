export default class DebugLoggerV6 {
  constructor({enabled = false, clock = () => new Date().toISOString()} = {}) { this.enabled = enabled; this.clock = clock; this.entries = []; }
  log(stage, event, data = {}) { if (!this.enabled) return; this.entries.push({at:this.clock(), stage, event, data}); }
  snapshot() { return this.enabled ? this.entries.map(row => ({...row, data:{...row.data}})) : []; }
}
