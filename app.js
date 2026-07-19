import { SalesEngine } from './engine.js';
import { RefundStatus } from './engines/RefundEngine.js';
import { TicketUsageType, DepartureStatus } from './shared/Constants.js';
import Version51StateController from './ui/Version51StateController.js';

window.__MARS_KILLER_APP_STARTED__ = true;
window.dispatchEvent(
  new Event('mars-killer-app-started')
);

const $ = id => document.getElementById(id);
let engine;
let version51State;
let lastPracticalResult = null;
let realtimeTimer = null;
let recalculationTimer = null;
let calculationInProgress = false;

const yen = value =>
  `${Number(value).toLocaleString('ja-JP')}円`;

const esc = value =>
  String(value).replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]
  );

const normalize = value =>
  String(value || '')
    .trim()
    .replace(
      /[ァ-ヶ]/g,
      char =>
        String.fromCharCode(
          char.charCodeAt(0) - 0x60
        )
    );

function setStatus(text, kind = '') {
  const element = $('status');
  element.textContent = text;
  element.className = `status ${kind}`;
}

function stationMatches(query) {
  if (!query?.trim() || !engine) {
    return [];
  }

  return engine.searchStations(query, {
    limit: 40,
    companyId: $('company')?.value || null
  });
}

function setupAutocomplete(inputId, boxId) {
  const input = $(inputId);
  const box = $(boxId);

  const show = () => {
    const rows = stationMatches(input.value);

    if (!input.value.trim() || !rows.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }

    box.innerHTML = rows.map(station => `
      <button
        type="button"
        class="candidate"
        data-name="${esc(station.station_name)}"
      >
        <strong>${esc(station.station_name)}</strong>
        <span>${esc(station.station_reading)}</span>
      </button>
    `).join('');

    box.hidden = false;
  };

  input.addEventListener('input', show);
  input.addEventListener('focus', show);

  box.addEventListener('click', event => {
    const button = event.target.closest('.candidate');

    if (!button) {
      return;
    }

    input.value = button.dataset.name;
    box.hidden = true;
  });

  document.addEventListener('click', event => {
    if (
      event.target !== input &&
      !box.contains(event.target)
    ) {
      box.hidden = true;
    }
  });
}

function formulaForSale(result) {
  return `${
    result.components.map(component => {
      const distance = component.lookup_km
        ? `（適用距離 ${component.lookup_km}km）`
        : '';

      return `${distance}${
        component.name || component.component
      } ${yen(component.amount_yen)}`;
    }).join(' ＋ ')
  } ＝ ${yen(result.total_yen)}`;
}

function refundStatusOptions(ticketType) {
  if (ticketType === 'ordinary') {
    return [
      {
        value: RefundStatus.BEFORE_TRIP,
        label: '旅行開始前'
      },
      {
        value: RefundStatus.AFTER_TRIP_START,
        label: '旅行開始後'
      },
      {
        value: RefundStatus.JOURNEY_ABANDONED,
        label: '前途放棄'
      }
    ];
  }

  return [
    {
      value: RefundStatus.BEFORE_TRAIN_DEPARTURE,
      label: '列車発車前'
    },
    {
      value: RefundStatus.AFTER_TRAIN_DEPARTURE,
      label: '列車発車後'
    },
    {
      value: RefundStatus.AFTER_USE_START,
      label: '使用開始後'
    }
  ];
}

function syncRefundStatusOptions() {
  const ticketType = $('refundTicketType').value;
  const current = $('refundStatus').value;
  const options = refundStatusOptions(ticketType);

  $('refundStatus').innerHTML = options
    .map(option => `
      <option value="${esc(option.value)}">
        ${esc(option.label)}
      </option>
    `)
    .join('');

  if (options.some(option => option.value === current)) {
    $('refundStatus').value = current;
  }

  syncRefundAdditionalFields();
}

function syncRefundAdditionalFields() {
  const isAfterTripStart =
    $('refundTicketType').value === 'ordinary' &&
    $('refundStatus').value ===
      RefundStatus.AFTER_TRIP_START;

  $('refundAfterTripFields').hidden =
    !isAfterTripStart;
}

function ordinaryRefundAmount(components) {
  return components
    .filter(component =>
      component.component === 'ordinary_fare' ||
      component.component === 'special_fare'
    )
    .reduce(
      (total, component) =>
        total + Number(component.amount_yen),
      0
    );
}

function limitedExpressRefundAmount(components) {
  const ordinaryAmount =
    ordinaryRefundAmount(components);

  return components.reduce(
    (total, component) =>
      total + Number(component.amount_yen),
    0
  ) - ordinaryAmount;
}

function refundAmountForResult(
  ticketType,
  result
) {
  return ticketType === 'ordinary'
    ? ordinaryRefundAmount(result.components)
    : limitedExpressRefundAmount(
        result.components
      );
}

function createRefundOptions(result) {
  const ticketType = $('refundTicketType').value;
  const status = $('refundStatus').value;

  const options = {
    ticketType,
    status,
    amountYen: refundAmountForResult(
      ticketType,
      result
    )
  };

  if (
    ticketType === 'ordinary' &&
    status === RefundStatus.AFTER_TRIP_START
  ) {
    options.unusedAmountYen =
      Number($('unusedAmountYen').value);

    options.remainingBusinessKm =
      Number($('remainingBusinessKm').value);
  }

  return options;
}


function lineTypeLabel(value) {
  return value === 'local' ? '地方交通線' : '幹線';
}

function routeDistance(route) {
  return route?.distance || {
    sections: [],
    totals: {
      business_km: route?.business_km || 0,
      conversion_km: route?.conversion_km || 0,
      fare_calculation_km: route?.fare_calculation_km || 0
    }
  };
}

function renderDistanceSection(
  title,
  sections,
  lineType,
  field
) {
  const filtered = sections.filter(
    section =>
      section.line_type === lineType
  );

  if (!filtered.length) {
    return '';
  }

  return `
    <section class="reason distance-section">
      <h2>${esc(title)}</h2>
      ${filtered.map(section => `
        <div class="distance-row">
          <strong>${esc(section.line)}</strong>
          <span>${esc(section.from)}→${esc(section.to)}</span>
          <b>${esc(section[field])}km</b>
        </div>
      `).join('')}
    </section>
  `;
}

function renderDistanceSummary(distance) {
  const sections =
    distance.sections || [];

  return `
    ${renderDistanceSection(
      '営業キロ',
      sections,
      'main',
      'business_km'
    )}
    ${renderDistanceSection(
      '換算キロ',
      sections,
      'local',
      'conversion_km'
    )}
    <section class="reason distance-total">
      <h2>運賃計算キロ</h2>
      <p class="total-distance">
        ${esc(
          distance.totals
            ?.fare_calculation_km || 0
        )}km
      </p>
    </section>
  `;
}

function renderRouteFlow(route) {
  const sections =
    route?.distance?.sections ||
    route?.sections ||
    [];

  if (!sections.length) {
    return '';
  }

  const steps = [
    `<strong>${esc(
      sections[0].from
    )}</strong>`
  ];

  for (const section of sections) {
    steps.push(`
      <span class="route-arrow">↓</span>
      <span>
        ${esc(section.line)}
        （${esc(
          lineTypeLabel(
            section.line_type
          )
        )}）
      </span>
      <span class="route-arrow">↓</span>
      <strong>${esc(section.to)}</strong>
    `);
  }

  return `
    <section class="reason">
      <h2>経路</h2>
      <div class="route-flow">
        ${steps.join('')}
      </div>
    </section>
  `;
}

function renderCalculationLog(items) {
  if (!items?.length) {
    return '';
  }

  return items.map(item => {
    const sections =
      item.sections ||
      item.used_sections ||
      [];

    const lines = sections.map(
      section => section.line
    );

    return `
      <article class="calculation-log">
        <p>
          <strong>${esc(
            item.engine || 'Engine'
          )}</strong>
          ${
            item.operation
              ? ` / ${esc(item.operation)}`
              : ''
          }
        </p>
        ${
          item.business_km != null
            ? `<p>営業キロ：${
                esc(item.business_km)
              }km</p>`
            : ''
        }
        ${
          item.conversion_km != null
            ? `<p>換算キロ：${
                esc(item.conversion_km)
              }km</p>`
            : ''
        }
        ${
          item.fare_calculation_km != null
            ? `<p>運賃計算キロ：${
                esc(
                  item.fare_calculation_km
                )
              }km</p>`
            : ''
        }
        ${
          lines.length
            ? `<p>使用路線：${
                lines
                  .map(esc)
                  .join(' → ')
              }</p>`
            : ''
        }
        ${
          sections.length
            ? `<p>使用区間：${
                sections
                  .map(section => {
                    const distanceText =
                      section.line_type ===
                      'local'
                        ? `換算キロ ${
                            esc(
                              section
                                .conversion_km
                            )
                          }km`
                        : `営業キロ ${
                            esc(
                              section
                                .business_km
                            )
                          }km`;

                    return `${
                      esc(section.from)
                    }→${
                      esc(section.to)
                    }（${
                      esc(section.line)
                    }・${
                      esc(
                        lineTypeLabel(
                          section.line_type
                        )
                      )
                    }・${distanceText}）`;
                  })
                  .join(' → ')
              }</p>`
            : ''
        }
        ${
          item.reason
            ? `<p>${esc(item.reason)}</p>`
            : ''
        }
      </article>
    `;
  }).join('');
}

function renderSale(result) {
  const route = result.route;

  const components = result.components
    .map(component => `
      <tr>
        <td>${esc(
          component.name || component.component
        )}</td>
        <td>${
          component.lookup_km
            ? `${component.lookup_km}km`
            : ''
        }</td>
        <td>${yen(component.amount_yen)}</td>
      </tr>
    `)
    .join('');

  const distance = routeDistance(route);

  const segments = route.segments
    .map((segment, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${esc(segment.from_station_name)}</td>
        <td>${esc(segment.to_station_name)}</td>
        <td>${esc(segment.line_name)}</td>
        <td>${esc(lineTypeLabel(segment.line_type))}</td>
        <td>${segment.line_type === 'local' ? '' : esc(segment.business_km)}</td>
        <td>${segment.line_type === 'local' ? esc(segment.conversion_km) : ''}</td>
      </tr>
    `)
    .join('');

  $('result').innerHTML = `
    <section class="summary">
      <p class="eyebrow">発売額</p>
      <p class="total">${yen(result.total_yen)}</p>
      <p>
        ${esc(route.start_station_name)}
        →
        ${esc(route.goal_station_name)}
      </p>
    </section>

    ${renderDistanceSummary(distance)}
    ${renderRouteFlow({distance})}

    <section class="reason">
      <h2>計算根拠</h2>
      <p class="formula">
        ${formulaForSale(result)}
      </p>
    </section>

    <section class="guidance">
      <h2>お客様への御案内</h2>
      <p>
        「合計${yen(result.total_yen)}
        でございます。」
      </p>
    </section>

    <details>
      <summary>内訳・経路</summary>

      <h2>内訳</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>項目</th>
              <th>適用距離</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>${components}</tbody>
        </table>
      </div>

      <h2>経路（${route.segments.length}区間）</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>発</th>
              <th>着</th>
              <th>線名</th>
              <th>路線区分</th>
              <th>営業キロ</th>
              <th>換算キロ</th>
            </tr>
          </thead>
          <tbody>${segments}</tbody>
        </table>
      </div>
    </details>

    ${
      result.warnings.length
        ? `<div class="notice">${
            result.warnings.map(esc).join('<br>')
          }</div>`
        : ''
    }
  `;

  showResult();
}

function renderRefund(result, refund) {
  const route = result.route;

  const formula = refund.refundable
    ? `${yen(refund.refund_before_fee_yen)} − 手数料 ${
        yen(refund.fee_yen)
      } ＝ ${yen(refund.refund_after_fee_yen)}`
    : '払戻し不可';

  const guidance = refund.refundable
    ? `「払戻手数料は${yen(refund.fee_yen)}、払戻額は${
        yen(refund.refund_after_fee_yen)
      }でございます。よろしいでしょうか？」`
    : `「${esc(
        refund.non_refundable_reason ||
        '払戻しできません。'
      )}」`;

  const basis = refund.calculation_basis || {};

  $('result').innerHTML = `
    <section class="summary">
      <p class="eyebrow">
        ${refund.refundable ? '払戻額' : '払戻判定'}
      </p>
      <p class="total">
        ${
          refund.refundable
            ? yen(refund.refund_after_fee_yen)
            : '払戻し不可'
        }
      </p>
      <p>
        ${esc(route.start_station_name)}
        →
        ${esc(route.goal_station_name)}
      </p>
    </section>

    <div class="metrics">
      <div>
        <span>払戻対象</span>
        <strong>${esc(refund.refund_target)}</strong>
      </div>
      <div>
        <span>手数料</span>
        <strong>${yen(refund.fee_yen)}</strong>
      </div>
      <div>
        <span>判定状態</span>
        <strong>${esc(refund.status)}</strong>
      </div>
    </div>

    <section class="reason">
      <h2>計算根拠</h2>
      <p class="formula">${formula}</p>
      <p>${esc(refund.reason)}</p>
      ${
        refund.non_refundable_reason
          ? `<p><strong>${esc(
              refund.non_refundable_reason
            )}</strong></p>`
          : ''
      }
      ${
        basis.formula
          ? `<p>${esc(basis.formula)}</p>`
          : ''
      }
      ${
        basis.remaining_business_km != null
          ? `<p>未使用区間営業キロ：${
              esc(basis.remaining_business_km)
            }km</p>`
          : ''
      }
    </section>

    <section class="guidance">
      <h2>お客様への御案内</h2>
      <p>${guidance}</p>
    </section>

    ${
      refund.refundable
        ? `
          <section
            class="caution"
            role="alert"
          >
            <h2>必ず確認</h2>
            <p>
              <strong>
                手数料 ${yen(refund.fee_yen)}
              </strong>
              がかかることを御案内し、
              <strong>お客様の了承後</strong>
              に払戻操作を行います。
            </p>
          </section>
        `
        : ''
    }

    <details>
      <summary>見積内訳・経路</summary>
      <pre>${esc(JSON.stringify({
        ticket_type: refund.ticket_type,
        status: refund.status,
        refund_before_fee_yen:
          refund.refund_before_fee_yen,
        fee_yen: refund.fee_yen,
        refund_after_fee_yen:
          refund.refund_after_fee_yen,
        calculation_basis:
          refund.calculation_basis
      }, null, 2))}</pre>
    </details>
  `;

  showResult();
}

function showResult() {
  $('result').hidden = false;
  $('result').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}


function checkedValue(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
function syncBusinessPeriodFields() { $('businessPeriodFields').hidden = checkedValue('ticketUsageType') !== TicketUsageType.VALID_PERIOD; }
function createBusinessInput(via) {
  const requestDate=$('requestDate').value, usage=checkedValue('ticketUsageType'), departure=checkedValue('departureStatus');
  return {requestDate,ticketType:$('businessTicketType').value,ticketUsageType:usage,ticketStartDate:usage===TicketUsageType.VALID_PERIOD?$('ticketStartDate').value:requestDate,ticketEndDate:usage===TicketUsageType.VALID_PERIOD?$('ticketEndDate').value:requestDate,departureStatus:departure===DepartureStatus.AFTER_DEPARTURE?DepartureStatus.AFTER_DEPARTURE:DepartureStatus.BEFORE_DEPARTURE,discountType:$('discount').value||null,operation:$('businessOperation').value,debugMode:$('businessDebugMode')?.checked||false,start:$('start').value,goal:$('goal').value,actualGoal:$('goal').value,via,passenger:(version51State?.getOptions().passengers?.[0]?.age_category==='child'?'child':'adult')};
}
function renderBusiness(result) {
  const state = result.business_state || {};
  const fare = result.fare || {};
  const regulationDetails =
    result.regulation_details || [];

  const applied = regulationDetails.filter(
    item => item.applicable
  );

  const notApplied =
    regulationDetails.filter(
      item => !item.applicable
    );

  const regulationRows = items =>
    items.length
      ? items.map(item => `
          <li>
            <strong>${esc(item.name)}</strong>
            <p>${esc(item.reason)}</p>
            <small>
              参照マスター：${esc(
                item.referenced_master || '不明'
              )} /
              優先順位：${esc(item.priority ?? '')}
            </small>
            ${
              item.reference_json
                ? `<small>参照JSON：${esc(
                    item.reference_json
                  )}</small>`
                : ''
            }
            ${
              item.missing_fields?.length
                ? `<small>不足入力：${
                    item.missing_fields
                      .map(esc)
                      .join('、')
                  }</small>`
                : ''
            }
            ${
              item.calculated_value != null
                ? `<pre>${esc(
                    JSON.stringify(
                      item.calculated_value,
                      null,
                      2
                    )
                  )}</pre>`
                : ''
            }
          </li>
        `).join('')
      : '<li>該当なし</li>';

  $('result').innerHTML = `
    <section class="summary">
      <p class="eyebrow">営業実務計算</p>
      <p class="total">
        ${
          result.success
            ? yen(fare.total)
            : '計算不可'
        }
      </p>
      <p>${esc(result.operation || '')}</p>
    </section>

    <div class="metrics">
      <div>
        <span>原券</span>
        <strong>${yen(fare.original || 0)}</strong>
      </div>
      <div>
        <span>追加</span>
        <strong>${yen(fare.additional || 0)}</strong>
      </div>
      <div>
        <span>払戻</span>
        <strong>${yen(fare.refund || 0)}</strong>
      </div>
    </div>

    ${renderDistanceSummary(result.distance || {
      sections: [],
      totals: {
        business_km: 0,
        conversion_km: 0,
        fare_calculation_km: 0
      }
    })}

    ${renderRouteFlow({distance: result.distance})}

    <section class="reason">
      <h2>営業状態</h2>
      <p>
        使用前：
        ${state.before_use ? 'はい' : 'いいえ'} /
        有効期間中：
        ${
          state.in_valid_period
            ? 'はい'
            : 'いいえ'
        } /
        有効期間終了後：
        ${state.expired ? 'はい' : 'いいえ'}
      </p>
    </section>

    <section class="reason">
      <h2>営業規則判定結果</h2>

      ${
        result.railway_master
          ? `
            <h3>使用会社</h3>
            <p>${
              result.railway_master.companies
                .map(item => esc(item.name))
                .join('、') || 'なし'
            }</p>
            <h3>使用路線</h3>
            <p>${
              result.railway_master.lines
                .map(item => esc(item.name))
                .join('、') || 'なし'
            }</p>
            <h3>使用駅</h3>
            <p>${
              result.railway_master.stations
                .map(item => esc(item.name))
                .join('、') || 'なし'
            }</p>
            <h3>区間一覧（経路順）</h3>
            <ol>
              ${
                result.distance
                  ?.sections
                  ?.length
                    ? result.distance
                        .sections
                        .map(section => `
                          <li>
                            ${esc(section.from)}
                            →
                            ${esc(section.to)}
                            /
                            ${esc(section.line)}
                            （${esc(
                              lineTypeLabel(
                                section.line_type
                              )
                            )}）
                            /
                            ${
                              section.line_type ===
                              'local'
                                ? `換算キロ ${
                                    esc(
                                      section
                                        .conversion_km
                                    )
                                  }km`
                                : `営業キロ ${
                                    esc(
                                      section
                                        .business_km
                                    )
                                  }km`
                            }
                          </li>
                        `)
                        .join('')
                    : '<li>なし</li>'
              }
            </ol>
            <h3>距離合計</h3>
            <p>
              営業キロ合計：${esc(result.distance?.totals.business_km || 0)}km /
              換算キロ合計：${esc(result.distance?.totals.conversion_km || 0)}km /
              運賃計算キロ：${
                esc(result.distance?.totals.fare_calculation_km || 0)
              }km
            </p>
            ${
              result.railway_master.reference_json
                ? `<p>鉄道参照JSON：${
                    result.railway_master.reference_json
                      .map(esc)
                      .join('、')
                  }</p>`
                : ''
            }
          `
          : ''
      }

      <h3>参照したマスター</h3>
      <p>
        ${
          result.referenced_masters?.length
            ? result.referenced_masters
                .map(esc)
                .join('、')
            : 'なし'
        }
      </p>

      <h3>適用された規則</h3>
      <ul>
        ${regulationRows(applied)}
      </ul>

      <h3>適用されなかった規則</h3>
      <ul>
        ${regulationRows(notApplied)}
      </ul>
    </section>

    <section class="reason">
      <h2>計算内容</h2>
      ${
        result.calculation?.length
          ? renderCalculationLog(result.calculation)
          : `<p>${esc(
              result.message ||
              '計算結果なし'
            )}</p>`
      }
    </section>

    ${
      result.error_code
        ? `<div class="notice">${
            esc(result.error_code)
          }：${esc(
            result.message || ''
          )}</div>`
        : ''
    }
  `;

  showResult();
}


function practicalOptions(via = []) {
  const v51 = version51State?.getOptions() || {};
  return {
    ...v51,
    start: v51.start || $('start').value,
    goal: v51.goal || $('goal').value,
    via: v51.via || via,
    travelDate: v51.travelDate || $('date').value,
    trip_type: $('tripType')?.value || 'one_way',
    transfer: Boolean($('transfer')?.checked),
    sleeper: Boolean($('sleeper')?.checked),
    chargeTableId: $('charge').value || null,
    productId: $('product').value || null,
    discountId: null
  };
}


function clearValidationMarkers() {
  document.querySelectorAll('.field-invalid').forEach(element => {
    element.classList.remove('field-invalid');
    element.removeAttribute('aria-invalid');
  });
}

function validationTarget(field) {
  const map = {
    origin: 'start',
    destination: 'goal',
    via: 'viaList',
    passengers: 'passengerGroups',
    section_services: 'sectionServices'
  };
  return $(map[field] || field);
}

function renderLiveValidation(validation) {
  const panel = $('liveValidation');
  if (!panel) return;
  clearValidationMarkers();
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  for (const item of errors) {
    const target = validationTarget(item.field);
    target?.classList.add('field-invalid');
    target?.setAttribute('aria-invalid', 'true');
  }
  if (!errors.length && !warnings.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.innerHTML = `
    ${errors.length ? `<strong>入力エラー</strong><ul>${errors.map(item => `<li>${esc(item.message)}</li>`).join('')}</ul>` : ''}
    ${warnings.length ? `<strong>確認事項</strong><ul>${warnings.map(item => `<li>${esc(item.message)}</li>`).join('')}</ul>` : ''}
  `;
  panel.hidden = false;
}

function runRealtimeValidation() {
  if (!engine || !version51State) return;
  try {
    const validation = engine.validatePracticalInput(practicalOptions());
    renderLiveValidation(validation);
  } catch (error) {
    renderLiveValidation({errors: [{message: error.message, field: null}], warnings: []});
  }
}

function scheduleRealtimeValidation() {
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(runRealtimeValidation, 120);
}

function scheduleSmartRecalculation(scope) {
  scheduleRealtimeValidation();
  if (!lastPracticalResult || calculationInProgress) return;
  if (['route-input', 'initial', 'history-restore'].includes(scope)) return;
  clearTimeout(recalculationTimer);
  recalculationTimer = setTimeout(() => calculate({scope, silent: true}), 180);
}

function renderExecutionMetrics(result) {
  const rows = result.execution_metrics || [];
  if (!rows.length) return '<p>実行時間情報はありません。</p>';
  return `<div class="engine-timings">${rows.map(row => `
    <div class="engine-timing">
      <span>${esc(row.engine)}${row.cache_hit ? '（経路再利用）' : ''}</span>
      <strong>${Number(row.duration_ms || 0).toLocaleString('ja-JP')}ms</strong>
    </div>`).join('')}</div>`;
}

function passengerLabel(row) {
  const age = row.age_category === 'child'
    ? '小児'
    : row.age_category === 'assistant'
      ? '介助者'
      : '大人';
  const labels = {
    none: '通常',
    student: '学割',
    disability_type1: '障害者1種',
    disability_type2: '障害者2種',
    round_trip: '往復割引',
    group: '団体',
    other: 'その他割引',
    assistant_normal: '通常介助者',
    assistant_type1: '障害者1種介助者',
    assistant_type2: '障害者2種介助者'
  };
  return {age, discount: labels[row.discount_type] || row.discount_type};
}

function renderPassengerRows(result) {
  return result.passenger_rows.map(row => {
    const label = passengerLabel(row);
    return `
      <article class="passenger-result-card">
        <header>
          <strong>${esc(label.age)}・${esc(label.discount)}</strong>
          <span>${esc(row.count)}人</span>
        </header>
        <dl>
          <div><dt>1人あたり普通運賃</dt><dd>${yen(row.fare.unit_fare)}</dd></div>
          <div><dt>1人あたり料金</dt><dd>${yen(row.charges.unit_charge)}</dd></div>
          <div><dt>1人あたり割引額</dt><dd>−${yen(row.discount.unit_discount)}</dd></div>
          <div><dt>1人あたり加算額</dt><dd>${yen(row.extra_charge.unit_extra_charge)}</dd></div>
          <div class="passenger-subtotal"><dt>グループ小計</dt><dd>${yen(row.subtotal)}</dd></div>
        </dl>
        <p><strong>営業規則件数：</strong>${esc(row.applied_rule_count || 0)}件</p>
        <details>
          <summary>計算式</summary>
          <ol class="formula-steps">
            ${row.formula_steps.map(step => `
              <li>
                <strong>${esc(step.label)}</strong>
                <span>${step.expression
                  ? `${esc(step.expression)} ＝ ${yen(step.value_yen)}`
                  : step.value_yen != null
                    ? yen(step.value_yen)
                    : `${esc(step.value)}${esc(step.unit || '')}`}</span>
              </li>
            `).join('')}
          </ol>
        </details>
        <details>
          <summary>営業規則</summary>
          ${(row.applied_rules || []).length
            ? `<ul>${row.applied_rules.map(rule => `
                <li>
                  <strong>${esc(rule.rule_title)}</strong>
                  <span>${esc(rule.result)}</span>
                  <p>${esc(rule.reason)}</p>
                  ${rule.rule_no ? `<small>規則ID：${esc(rule.rule_no)}</small>` : ''}
                </li>`).join('')}</ul>`
            : '<p>営業規則結果はありません。</p>'}
        </details>
        <details>
          <summary>RuleResolver</summary>
          <h4>候補</h4>
          <ul>${(row.rule_resolver?.candidate_rules || []).map(rule => `<li>${esc(rule.rule_title)}：${esc(rule.reason)}</li>`).join('') || '<li>なし</li>'}</ul>
          <h4>採用</h4>
          <ul>${(row.rule_resolver?.accepted_rules || []).map(rule => `<li>${esc(rule.rule_title)}：${esc(rule.reason)}</li>`).join('') || '<li>なし</li>'}</ul>
          <h4>却下</h4>
          <ul>${(row.rule_resolver?.rejected_rules || []).map(rule => `<li>${esc(rule.rule_title)}：${esc(rule.reason)}</li>`).join('') || '<li>なし</li>'}</ul>
        </details>
      </article>
    `;
  }).join('');
}

function renderPracticalSummary(result) {
  const candidates = result.route_candidates
    .map(candidate => `
      <article class="v5-card">
        <strong>${esc(candidate.label)}</strong>
        <span>運賃計算キロ ${esc(candidate.route.fare_calculation_km)}km</span>
        <span>会社境界 ${esc(candidate.company_boundary_count)}箇所</span>
      </article>
    `).join('');

  const debug = $('debugMode')?.checked
    ? `<details open>
        <summary>デバッグJSON</summary>
        <pre>${esc(JSON.stringify({
          RouteEngine: result.route,
          FareEngine: result.fare_result,
          ChargeEngine: result.charge_result,
          DiscountEngine: result.discount_result,
          BusinessEngine: result.business_result,
          RuleResolver: result.rule_resolver_result,
          ValidationEngine: result.validation,
          PracticalOperationPlatform: result,
          execution_metrics: result.execution_metrics,
          recalculation: result.recalculation,
          engine_logs: engine.getDebugLogs(),
          error_logs: engine.getErrorLogs()
        }, null, 2))}</pre>
      </details>`
    : '';

  $('result').innerHTML = `
    <section class="summary">
      <p class="eyebrow">全旅客合計</p>
      <p class="total">${yen(result.totals.total_yen)}</p>
      <p>${esc(result.route.start_station_name)} → ${esc(result.route.goal_station_name)}</p>
    </section>
    ${renderDistanceSummary(result.distance)}
    ${renderRouteFlow(result.route)}
    <section class="reason">
      <h2>料金結果</h2>
      <div class="v5-grid">
        <article class="v5-card"><strong>普通運賃合計</strong><span>${yen(result.totals.ordinary_fare_total_yen)}</span></article>
        <article class="v5-card"><strong>料金合計</strong><span>${yen(result.totals.charge_total_yen)}</span></article>
        <article class="v5-card"><strong>割引合計</strong><span>−${yen(result.totals.discount_total_yen)}</span></article>
        <article class="v5-card"><strong>加算合計</strong><span>${yen(result.totals.extra_charge_total_yen)}</span></article>
        <article class="v5-card v5-total"><strong>総合計</strong><span>${yen(result.totals.total_yen)}</span></article>
      </div>
    </section>
    <section class="reason">
      <h2>旅客別内訳</h2>
      <div class="passenger-result-list">${renderPassengerRows(result)}</div>
    </section>
    <section class="reason">
      <h2>経路候補</h2>
      <div class="v5-grid">${candidates}</div>
    </section>
    <section class="reason">
      <h2>Engine実行時間</h2>
      ${renderExecutionMetrics(result)}
    </section>
    <section class="reason">
      <h2>Validation</h2>
      ${result.validation.errors.length
        ? `<div class="notice" role="alert">${result.validation.errors.map(item => esc(item.message)).join('<br>')}</div>`
        : '<p>エラーはありません。</p>'}
      ${result.validation.warnings.length
        ? `<div class="notice">${result.validation.warnings.map(item => esc(item.message)).join('<br>')}</div>`
        : ''}
    </section>
    ${result.warnings.length ? `<div class="notice">${result.warnings.map(esc).join('<br>')}</div>` : ''}
    ${debug}
  `;
  showResult();
}

function refreshHistoryUi() {
  const box = $('historyList');
  if (!box || !engine) return;
  const history = engine.getSearchHistory();
  box.innerHTML = history.length
    ? history.map(entry => `
        <article class="history-row">
          <div><strong>${esc(entry.conditions.start)}
            → ${esc(entry.conditions.goal)}</strong><br>
          <small>${esc(new Date(entry.created_at).toLocaleString('ja-JP'))}</small></div>
          <span>${yen(entry.total_yen)}</span>
          <button type="button" class="history-restore" data-history-id="${esc(entry.id || entry.created_at)}">復元</button>
        </article>
      `).join('')
    : '<p>履歴はありません。</p>';
}

async function calculate(request = {}) {
  if (request instanceof Event) request = {};
  const {scope = 'full', silent = false} = request;
  if (calculationInProgress) return;
  calculationInProgress = true;
  try {
    if (!silent) setStatus('計算中…');

    const via = version51State?.getOptions().via || [];

    engine.setDebugEnabled(
      Boolean($('debugMode')?.checked)
    );

    const practical =
      await engine.practicalQuote({
        ...practicalOptions(via),
        recalculation_scope: scope
      });
    lastPracticalResult = practical;

    const stateOptions = practicalOptions(via);
    version51State?.applyRoute(practical.route);

    if ($('operation').value === 'business') {
      renderBusiness(engine.business(createBusinessInput(via)));
    } else if ($('operation').value === 'refund') {
      const primaryPassenger = stateOptions.passengers?.[0]?.age_category === 'child'
        ? 'child'
        : 'adult';
      const legacyQuote = engine.quote({
        start: stateOptions.start,
        goal: stateOptions.goal,
        via: stateOptions.via,
        passenger: primaryPassenger,
        travelDate: stateOptions.travelDate,
        chargeTableId: $('charge').value || null,
        productId: $('product').value || null,
        discountId: $('discount').value || null
      });
      const refund = engine.refund(createRefundOptions(legacyQuote));
      renderRefund(legacyQuote, refund);
    } else {
      renderPracticalSummary(practical);
    }
    refreshHistoryUi();

    renderLiveValidation(practical.validation);
    setStatus(
      navigator.onLine
        ? '計算完了'
        : 'オフラインで計算完了',
      'ok'
    );

    localStorage.setItem(
      'lastInput',
      JSON.stringify({
        operation: $('operation').value,
        start: $('start').value,
        goal: $('goal').value,
        via: via.join(','),
        passengers: stateOptions.passengers,
        date: $('date').value,
        charge: $('charge').value,
        product: $('product').value,
        discount: $('discount').value,
        refundTicketType:
          $('refundTicketType').value,
        refundStatus:
          $('refundStatus').value,
        unusedAmountYen:
          $('unusedAmountYen').value,
        remainingBusinessKm:
          $('remainingBusinessKm').value
      })
    );
  } catch (error) {
    const validation = error.details?.validation;
    if (validation) renderLiveValidation(validation);
    setStatus(`${error.engine ? `${error.engine}: ` : ''}${error.message}`, 'error');
  } finally {
    calculationInProgress = false;
  }
}

function restore() {
  try {
    const values = JSON.parse(
      localStorage.getItem('lastInput')
    );

    if (!values) {
      return;
    }

    for (const [key, value] of Object.entries(values)) {
      if ($(key)) {
        $(key).value = value;
      }
    }
  } catch {
    // 保存値が壊れている場合は初期値を使用する。
  }
}

function syncOperation() {
  const operation = $('operation').value;
  const refund = operation === 'refund';
  const business = operation === 'business';
  $('refundOptions').hidden = !refund;
  $('businessOptions').hidden = !business;
  $('calc').textContent = business ? '営業実務を計算' : refund ? '払戻額を計算' : '発売額を計算';
}

function applyTheme(value) {
  document.documentElement.dataset.theme = value;
  localStorage.setItem('theme', value);

  const meta = document.querySelector(
    'meta[name="theme-color"]'
  );

  if (meta) {
    meta.content = value === 'dark'
      ? '#101820'
      : '#075b91';
  }
}

function setupTheme() {
  const saved =
    localStorage.getItem('theme') ||
    'system';

  $('theme').value = saved;
  applyTheme(saved);

  $('theme').addEventListener(
    'change',
    event => applyTheme(event.target.value)
  );
}


let serviceWorkerRegistration = null;
let serviceWorkerReloaded = false;

function updateElements() {
  return {
    area: $('updateNotice'),
    message: $('updateMessage'),
    button: $('updateButton')
  };
}

function showUpdateNotice(
  message =
    '新しいバージョンがあります。更新すると最新版へ切り替わります。',
  {
    buttonText = '更新する',
    kind = ''
  } = {}
) {
  const {
    area,
    message: messageElement,
    button
  } = updateElements();

  if (
    !area ||
    !messageElement ||
    !button
  ) {
    return;
  }

  messageElement.textContent = message;
  button.textContent = buttonText;
  button.disabled =
    kind === 'working';
  area.dataset.kind = kind;
  area.hidden = false;
}

function hideUpdateNotice() {
  const { area } = updateElements();

  if (area) {
    area.hidden = true;
    area.dataset.kind = '';
  }
}

function waitingWorker(
  registration =
    serviceWorkerRegistration
) {
  return (
    registration?.waiting ||
    (
      registration?.installing
        ?.state === 'installed'
        ? registration.installing
        : null
    )
  );
}

function requestServiceWorkerUpdate() {
  try {
    const worker =
      waitingWorker();

    if (!worker) {
      throw new Error(
        '更新用Service Workerが待機していません。'
      );
    }

    setStatus('更新中…');
    showUpdateNotice(
      '最新版へ切り替えています。',
      {
        buttonText: '更新中…',
        kind: 'working'
      }
    );

    worker.postMessage({
      type: 'SKIP_WAITING'
    });
  } catch (error) {
    setStatus(
      `更新失敗: ${error.message}`,
      'error'
    );
    showUpdateNotice(
      `更新に失敗しました。${error.message}`,
      {
        buttonText: '再試行',
        kind: 'error'
      }
    );
  }
}

function watchInstallingWorker(
  registration,
  worker
) {
  if (!worker) {
    return;
  }

  worker.addEventListener(
    'statechange',
    () => {
      if (
        worker.state === 'installed' &&
        navigator.serviceWorker
          .controller
      ) {
        showUpdateNotice();
      }

      if (
        worker.state === 'redundant'
      ) {
        setStatus(
          '更新失敗: Service Workerのインストールに失敗しました。',
          'error'
        );
        showUpdateNotice(
          '更新の準備に失敗しました。',
          {
            buttonText: '再確認',
            kind: 'error'
          }
        );
      }
    }
  );
}

async function registerServiceWorker() {
  if (
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  setStatus('更新確認中…');

  try {
    const registration =
      await navigator.serviceWorker
        .register(
          './service-worker.js',
          {
            updateViaCache: 'none'
          }
        );

    serviceWorkerRegistration =
      registration;

    if (
      registration.waiting &&
      navigator.serviceWorker.controller
    ) {
      showUpdateNotice();
    }

    if (registration.installing) {
      watchInstallingWorker(
        registration,
        registration.installing
      );
    }

    registration.addEventListener(
      'updatefound',
      () => {
        watchInstallingWorker(
          registration,
          registration.installing
        );
      }
    );

    await registration.update();
  } catch (error) {
    setStatus(
      `更新失敗: ${error.message}`,
      'error'
    );
    showUpdateNotice(
      '最新版の確認に失敗しました。通信状態を確認して再試行してください。',
      {
        buttonText: '再確認',
        kind: 'error'
      }
    );
  }
}

async function init() {
  window.__MARS_KILLER_APP_STARTED__ = true;
  window.dispatchEvent(
    new Event(
      'mars-killer-app-started'
    )
  );

  try {
    setupTheme();
    setStatus('マスタ読込み中…');

    engine = await SalesEngine.load('./data');

    restore();
    const today = new Date().toISOString().slice(0, 10);
    if (!$('date').value) $('date').value = today;
    if (!$('requestDate').value) $('requestDate').value = today;
    if (!$('ticketStartDate').value) $('ticketStartDate').value = today;
    if (!$('ticketEndDate').value) $('ticketEndDate').value = today;
    version51State = new Version51StateController({engine}).init();
    document.addEventListener('mars-killer-v5.1-state-change', event => {
      scheduleSmartRecalculation(event.detail?.scope || 'calculation');
    });
    scheduleRealtimeValidation();

    syncRefundStatusOptions();
    syncBusinessPeriodFields();
    syncOperation();
    refreshHistoryUi();

    setStatus(
      `準備完了：${engine.stations.length}駅`,
      'ok'
    );

    window.__MARS_KILLER_APP_READY__ = true;
    window.dispatchEvent(
      new Event(
        'mars-killer-app-ready'
      )
    );

    $('calc').disabled = false;
  } catch (error) {
    setStatus(
      `初期化エラー: ${error.message}`,
      'error'
    );
  }
}

$('calc').addEventListener('click', calculate);

$('operation').addEventListener(
  'change',
  syncOperation
);

$('refundTicketType').addEventListener(
  'change',
  syncRefundStatusOptions
);

$('refundStatus').addEventListener(
  'change',
  syncRefundAdditionalFields
);

document.querySelectorAll('input[name="ticketUsageType"]').forEach(input => input.addEventListener('change', syncBusinessPeriodFields));

$('swap').addEventListener('click', () => {
  const start = $('start').value;
  $('start').value = $('goal').value;
  $('goal').value = start;
  $('start').dataset.stationId = '';
  $('goal').dataset.stationId = '';
  $('start').dispatchEvent(new Event('input', {bubbles: true}));
  $('goal').dispatchEvent(new Event('input', {bubbles: true}));
});

window.addEventListener(
  'online',
  () => setStatus('オンライン', 'ok')
);

window.addEventListener(
  'offline',
  () => setStatus('オフライン利用中', 'ok')
);

$('updateButton')?.addEventListener(
  'click',
  () => {
    if (
      waitingWorker()
    ) {
      requestServiceWorkerUpdate();
    } else {
      hideUpdateNotice();
      registerServiceWorker();
    }
  }
);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      if (serviceWorkerReloaded) {
        return;
      }

      serviceWorkerReloaded = true;
      location.reload();
    }
  );

  window.addEventListener(
    'load',
    registerServiceWorker
  );
}

$('historyList')?.addEventListener('click', event => {
  const button = event.target.closest('[data-history-id]');
  if (!button) return;
  const entry = engine.getSearchHistory().find(item =>
    String(item.id || item.created_at) === button.dataset.historyId
  );
  if (!entry) return;
  version51State?.restoreSnapshot(entry);
  setStatus('履歴の入力条件を復元しました。', 'ok');
  scheduleRealtimeValidation();
});

$('clearHistory')?.addEventListener(
  'click',
  () => {
    engine.clearSearchHistory();
    refreshHistoryUi();
  }
);

$('debugMode')?.addEventListener(
  'change',
  event =>
    engine?.setDebugEnabled(
      event.target.checked
    )
);

init();
