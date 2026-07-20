const normalizeName = value => String(value || '').trim();

export default class ChargeAmountResolver {
  constructor(master = {}) {
    this.records = Array.isArray(master.records) ? master.records : [];
  }

  findRecord({tableIds = [], start, goal}) {
    const from = normalizeName(start);
    const to = normalizeName(goal);
    const ids = new Set(tableIds.filter(Boolean));
    return this.records.find(item => {
      const sameDirection = normalizeName(item.from) === from && normalizeName(item.to) === to;
      const reverseDirection = item.bidirectional !== false && normalizeName(item.from) === to && normalizeName(item.to) === from;
      return item.enabled !== false && ids.has(item.table_id) && (sameDirection || reverseDirection);
    }) || null;
  }

  amountFor(record, passenger, fallback) {
    if (!record) return Number(fallback);
    const key = passenger === 'child' ? 'child_yen' : 'adult_yen';
    const amount = Number(record[key]);
    return Number.isFinite(amount) ? amount : Number(fallback);
  }

  resolve({tableId, tableIds = [], start, goal, passenger = 'adult', calculatedAmount}) {
    const record = this.findRecord({tableIds: [tableId, ...tableIds], start, goal});
    return this.amountFor(record, passenger, calculatedAmount);
  }

  apply(component, context = {}) {
    if (!component) return component;

    const breakdown = Array.isArray(component.breakdown) ? component.breakdown : [];
    const tableIds = [
      component.table_id,
      context.tableId,
      ...breakdown.map(item => item?.table_id)
    ].filter(Boolean);
    const record = this.findRecord({
      tableIds,
      start: context.start,
      goal: context.goal
    });
    if (!record) return component;

    const originalAmount = Number(component.amount_yen);
    const adjustedAmount = this.amountFor(record, context.passenger, originalAmount);
    if (adjustedAmount === originalAmount) return component;

    const adjustedBreakdown = breakdown.map(item => {
      if (item?.table_id !== record.table_id) return item;
      return {
        ...item,
        amount_yen: adjustedAmount,
        ...(Number.isFinite(Number(item.base_amount_yen))
          ? {base_amount_yen: adjustedAmount - Number(item.season_adjustment_yen || 0)}
          : {})
      };
    });

    return {
      ...component,
      amount_yen: adjustedAmount,
      ...(adjustedBreakdown.length ? {breakdown: adjustedBreakdown} : {}),
      master_adjustment: {
        source: 'charge_amount_overrides',
        table_id: record.table_id,
        original_amount_yen: originalAmount,
        adjusted_amount_yen: adjustedAmount
      }
    };
  }
}
