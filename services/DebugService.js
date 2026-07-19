
export default class DebugService {
  constructor() {
    this.enabled = false;
    this.logs = [];
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  entries() {
    return [...this.logs];
  }

  async measure(engine, operation, callback) {
    const started = performance.now();
    try {
      const result = await callback();
      this.record({
        engine,
        operation,
        status: 'success',
        elapsed_ms:
          Number((performance.now() - started).toFixed(3)),
        result
      });
      return result;
    } catch (error) {
      this.record({
        engine,
        operation,
        status: 'error',
        elapsed_ms:
          Number((performance.now() - started).toFixed(3)),
        error: {
          name: error.name,
          message: error.message
        }
      });
      throw error;
    }
  }

  record(entry) {
    if (!this.enabled) return;
    this.logs = [{
      created_at: new Date().toISOString(),
      ...entry
    }, ...this.logs].slice(0, 100);
  }
}
