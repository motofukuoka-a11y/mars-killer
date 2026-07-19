import Version6Platform from '../services/v6/Version6Platform.js';

const numberOrUndefined = value => value === '' || value == null ? undefined : Number(value);

class ConfirmedFareAdapter {
  calculateUsedSectionFare(request) {
    const amount = numberOrUndefined(request.used_section_fare);
    if (!Number.isFinite(amount)) return null;
    return {
      amount_yen: amount,
      discount_re_evaluated: Boolean(request.discount_re_evaluated),
      confirmation_source: 'operator_input'
    };
  }
}

export default class Version6RefundController {
  constructor({root, result, debug = false} = {}) {
    this.root = root;
    this.result = result;
    this.platform = new Version6Platform({debug, fareEngine: new ConfirmedFareAdapter()});
  }

  setDebug(enabled) {
    this.platform = new Version6Platform({debug:Boolean(enabled), fareEngine:new ConfirmedFareAdapter()});
  }

  read() {
    const get = name => this.root.querySelector(`[name="${name}"]`);
    const value = name => get(name)?.value ?? '';
    const checked = name => Boolean(get(name)?.checked);
    const request = {
      business_mode: value('business_mode'),
      ticket_type: value('ticket_type'),
      travel_state: value('travel_state'),
      incident_type: value('incident_type') || undefined,
      selected_candidate: value('selected_candidate') || undefined,
      face_value: numberOrUndefined(value('face_value')),
      facility_charge: numberOrUndefined(value('facility_charge')),
      days_before_departure: numberOrUndefined(value('days_before_departure')),
      unused_business_km: numberOrUndefined(value('unused_business_km')),
      used_section_fare: numberOrUndefined(value('used_section_fare')),
      one_way_fare: numberOrUndefined(value('one_way_fare')),
      elapsed_days: numberOrUndefined(value('elapsed_days')),
      one_month_commuter_fare: numberOrUndefined(value('one_month_commuter_fare')),
      period_fare: numberOrUndefined(value('period_fare')),
      elapsed_periods: numberOrUndefined(value('elapsed_periods')),
      total_sheets: numberOrUndefined(value('total_sheets')),
      remaining_sheets: numberOrUndefined(value('remaining_sheets')),
      coupon_section_single_fare: numberOrUndefined(value('coupon_section_single_fare')),
      delay_minutes: numberOrUndefined(value('delay_minutes')),
      fare_amount: numberOrUndefined(value('fare_amount')),
      charge_amount: numberOrUndefined(value('charge_amount')),
      original_fare: numberOrUndefined(value('original_fare')),
      actual_fare: numberOrUndefined(value('actual_fare')),
      original_charge: numberOrUndefined(value('original_charge')),
      actual_charge: numberOrUndefined(value('actual_charge')),
      original_facility: numberOrUndefined(value('original_facility')),
      actual_facility: numberOrUndefined(value('actual_facility')),
      suspension_days: numberOrUndefined(value('suspension_days')),
      daily_split_fare: numberOrUndefined(value('daily_split_fare')),
      current_express_charge: numberOrUndefined(value('current_express_charge')),
      express_charge: numberOrUndefined(value('express_charge')),
      origin: value('origin') || undefined,
      return_station: value('return_station') || undefined,
      alternative_route: value('alternative_route') || undefined,
      returned_to_origin: checked('returned_to_origin'),
      special_product: checked('special_product'),
      before_validity_start: checked('before_validity_start'),
      discount_re_evaluated: checked('discount_re_evaluated')
    };
    return Object.fromEntries(Object.entries(request).filter(([,v]) => v !== undefined));
  }

  calculate() {
    const response = this.platform.execute(this.read());
    this.render(response);
    return response;
  }

  render(response) {
    this.result.hidden = false;
    if (response.error) {
      this.result.innerHTML = `<h2>Version 6 計算エラー</h2><p>${this.escape(response.error.user_message || response.error.message || '計算できませんでした。')}</p>`;
      return;
    }
    const candidates = response.candidate_list || response.resolved_rule?.candidate_list || [];
    const amount = Number(response.refund_amount ?? 0).toLocaleString('ja-JP');
    const checks = (response.manual_checks || []).map(v => `<li>${this.escape(v)}</li>`).join('');
    const warnings = (response.warnings || []).map(v => `<li>${this.escape(v)}</li>`).join('');
    this.result.innerHTML = `
      <h2>Version 6 計算結果</h2>
      <p><strong>状態：</strong>${this.escape(response.status || 'unknown')}</p>
      <p class="v6-refund-total"><strong>払戻額：</strong>${amount}円</p>
      ${response.formula ? `<p><strong>計算式：</strong>${this.escape(response.formula)}</p>` : ''}
      ${response.selected_rule ? `<p><strong>適用取扱：</strong>${this.escape(response.selected_rule)}</p>` : ''}
      ${candidates.length ? `<p><strong>候補：</strong>${candidates.map(v=>this.escape(v)).join('、')}</p>` : ''}
      ${checks ? `<h3>確認事項</h3><ul>${checks}</ul>` : ''}
      ${warnings ? `<h3>注意</h3><ul>${warnings}</ul>` : ''}
      <details><summary>計算データ</summary><pre>${this.escape(JSON.stringify(response,null,2))}</pre></details>`;
  }

  escape(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}
