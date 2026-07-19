import { SalesEngine } from './engine.js';
import { RefundStatus } from './engines/RefundEngine.js';
import { TicketUsageType, DepartureStatus } from './shared/Constants.js';

const $ = id => document.getElementById(id);
let engine;

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
  const normalized = normalize(query);

  if (!normalized) {
    return [];
  }

  return engine.stations
    .filter(station =>
      normalize(station.station_reading)
        .startsWith(normalized) ||
      normalize(station.station_name)
        .startsWith(normalized)
    )
    .sort((a, b) =>
      a.station_reading.localeCompare(
        b.station_reading,
        'ja'
      )
    )
    .slice(0, 40);
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

  const segments = route.segments
    .map((segment, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${esc(segment.from_station_name)}</td>
        <td>${esc(segment.to_station_name)}</td>
        <td>${esc(segment.line_name)}</td>
        <td>${segment.business_km}</td>
        <td>${segment.conversion_km}</td>
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

    <div class="metrics">
      <div>
        <span>営業キロ</span>
        <strong>${route.business_km}km</strong>
      </div>
      <div>
        <span>換算キロ</span>
        <strong>${route.conversion_km}km</strong>
      </div>
      <div>
        <span>計算キロ</span>
        <strong>${route.fare_calculation_km}km</strong>
      </div>
    </div>

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
              <th>営業</th>
              <th>換算</th>
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
  return {requestDate,ticketType:$('businessTicketType').value,ticketUsageType:usage,ticketStartDate:usage===TicketUsageType.VALID_PERIOD?$('ticketStartDate').value:requestDate,ticketEndDate:usage===TicketUsageType.VALID_PERIOD?$('ticketEndDate').value:requestDate,departureStatus:departure===DepartureStatus.AFTER_DEPARTURE?DepartureStatus.AFTER_DEPARTURE:DepartureStatus.BEFORE_DEPARTURE,discountType:$('discount').value||null,operation:$('businessOperation').value,start:$('start').value,goal:$('goal').value,actualGoal:$('goal').value,via,passenger:$('passenger').value};
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
          ? result.calculation.map(item =>
              `<p>${esc(
                JSON.stringify(item)
              )}</p>`
            ).join('')
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

async function calculate() {
  try {
    setStatus('計算中…');

    const via = $('via').value
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    const result = engine.quote({
      start: $('start').value,
      goal: $('goal').value,
      via,
      passenger: $('passenger').value,
      travelDate: $('date').value,
      chargeTableId:
        $('charge').value || null,
      productId:
        $('product').value || null,
      discountId:
        $('discount').value || null
    });

    if ($('operation').value === 'business') {
      renderBusiness(engine.business(createBusinessInput(via)));
    } else if ($('operation').value === 'refund') {
      const refund = engine.refund(
        createRefundOptions(result)
      );

      renderRefund(result, refund);
    } else {
      renderSale(result);
    }

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
        via: $('via').value,
        passenger: $('passenger').value,
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
    setStatus(error.message, 'error');
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

async function init() {
  try {
    setupTheme();
    setStatus('マスタ読込み中…');

    engine = await SalesEngine.load('./data');

    restore();
    const today = new Date().toISOString().slice(0, 10);
    if (!$('requestDate').value) $('requestDate').value = today;
    if (!$('ticketStartDate').value) $('ticketStartDate').value = today;
    if (!$('ticketEndDate').value) $('ticketEndDate').value = today;
    setupAutocomplete(
      'start',
      'startCandidates'
    );
    setupAutocomplete(
      'goal',
      'goalCandidates'
    );

    syncRefundStatusOptions();
    syncBusinessPeriodFields();
    syncOperation();

    setStatus(
      `準備完了：${engine.stations.length}駅`,
      'ok'
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
});

window.addEventListener(
  'online',
  () => setStatus('オンライン', 'ok')
);

window.addEventListener(
  'offline',
  () => setStatus('オフライン利用中', 'ok')
);

if ('serviceWorker' in navigator) {
  window.addEventListener(
    'load',
    () =>
      navigator.serviceWorker.register(
        './service-worker.js'
      )
  );
}

init();
