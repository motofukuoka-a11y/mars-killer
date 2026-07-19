import createStationAutocomplete from './StationAutocomplete.js';
import {
  PASSENGER_GROUP_DEFINITIONS,
  createPassengerState,
  normalizePassengers,
  passengerTotals
} from '../services/PassengerModel.js';
import {buildSectionServices} from '../services/SectionServiceManager.js';

const STORAGE_KEY = 'mars-killer-v5.1-input-state';
const MAX_VIA_STATIONS = 12;

const stationValue = station => ({
  station_id: station?.station_id ?? null,
  station_name: station?.station_name ?? ''
});

export default class Version51StateController {
  constructor({engine, root = document}) {
    this.engine = engine;
    this.root = root;
    this.autocompleteInstances = [];
    this.state = {
      search: {
        origin: {station_id: null, station_name: root.getElementById('start')?.value || ''},
        destination: {station_id: null, station_name: root.getElementById('goal')?.value || ''},
        via: [],
        procedure: {station_id: null, station_name: ''},
        travel_date: root.getElementById('date')?.value || null,
        company_preference: root.getElementById('company')?.value || null
      },
      passengers: createPassengerState(),
      route: {distance: null, section_services: []}
    };
  }

  init() {
    this.restore();
    this.setupFixedStationInputs();
    this.setupViaStations();
    this.renderPassengerInputs();
    this.renderPassengerRows();
    this.renderViaStations();
    this.renderSectionServices();
    this.bindGeneralInputs();
    this.emitChange('initial');
    return this;
  }

  setupFixedStationInputs() {
    this.bindStationAutocomplete('start', 'startCandidates', 'origin', false);
    this.bindStationAutocomplete('goal', 'goalCandidates', 'destination', false);
    this.bindStationAutocomplete('procedureStation', 'procedureCandidates', 'procedure', true);
  }

  bindStationAutocomplete(inputId, resultId, stateKey, allowEmpty) {
    const input = this.root.getElementById(inputId);
    const result = this.root.getElementById(resultId);
    if (!input || !result) return;

    const current = this.state.search[stateKey];
    if (current?.station_name) input.value = current.station_name;
    if (current?.station_id) input.dataset.stationId = current.station_id;

    const instance = createStationAutocomplete({
      inputElement: input,
      resultElement: result,
      stationSearchIndex: {search: (query, options) => this.engine.searchStations(query, options)},
      companyId: () => this.root.getElementById('company')?.value || null,
      allowEmpty,
      onSelect: station => {
        this.state.search[stateKey] = stationValue(station);
        this.save();
        this.emitChange(stateKey === 'procedure' ? 'procedure' : 'route');
      }
    });

    input.addEventListener('input', () => {
      const selectedId = input.dataset.stationId || null;
      if (!input.value.trim() && allowEmpty) {
        this.state.search[stateKey] = {station_id: null, station_name: ''};
      } else if (!selectedId) {
        this.state.search[stateKey] = {station_id: null, station_name: input.value};
      }
      this.save();
      this.emitChange(stateKey === 'procedure' ? 'procedure' : 'route-input');
    });
    this.autocompleteInstances.push(instance);
  }

  setupViaStations() {
    this.root.getElementById('addVia')?.addEventListener('click', () => {
      if (this.state.search.via.length >= MAX_VIA_STATIONS) return;
      this.state.search.via.push({station_id: null, station_name: ''});
      this.renderViaStations();
      this.save();
    });
  }

  renderViaStations() {
    const container = this.root.getElementById('viaList');
    if (!container) return;
    container.innerHTML = '';

    this.state.search.via.forEach((station, index) => {
      const row = document.createElement('div');
      row.className = 'via-row';
      row.innerHTML = `
        <div class="station-field">
          <label for="via-${index}">経由駅 ${index + 1}</label>
          <input id="via-${index}" autocomplete="off" inputmode="search" value="${this.escape(station.station_name)}">
          <div id="via-candidates-${index}" class="candidates" hidden></div>
        </div>
        <div class="via-actions" aria-label="経由駅 ${index + 1} の操作">
          <button type="button" data-action="up" aria-label="上へ移動">↑</button>
          <button type="button" data-action="down" aria-label="下へ移動">↓</button>
          <button type="button" data-action="remove" aria-label="削除">削除</button>
        </div>`;
      container.append(row);

      const input = row.querySelector('input');
      const result = row.querySelector('.candidates');
      if (station.station_id) input.dataset.stationId = station.station_id;
      createStationAutocomplete({
        inputElement: input,
        resultElement: result,
        stationSearchIndex: {search: (query, options) => this.engine.searchStations(query, options)},
        companyId: () => this.root.getElementById('company')?.value || null,
        onSelect: selected => {
          this.state.search.via[index] = stationValue(selected);
          this.save();
          this.emitChange('route');
        }
      });
      input.addEventListener('input', () => {
        if (!input.dataset.stationId) this.state.search.via[index] = {station_id: null, station_name: input.value};
        this.save();
        this.emitChange('route-input');
      });
      row.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        if (action === 'remove') this.state.search.via.splice(index, 1);
        if (action === 'up' && index > 0) [this.state.search.via[index - 1], this.state.search.via[index]] = [this.state.search.via[index], this.state.search.via[index - 1]];
        if (action === 'down' && index < this.state.search.via.length - 1) [this.state.search.via[index + 1], this.state.search.via[index]] = [this.state.search.via[index], this.state.search.via[index + 1]];
        this.renderViaStations();
        this.save();
        this.emitChange('route');
      });
    });

    if (!this.state.search.via.length) container.innerHTML = '<p class="input-help">経由駅は設定されていません。</p>';
  }

  renderPassengerInputs() {
    const container = this.root.getElementById('passengerGroups');
    if (!container) return;
    const grouped = Object.groupBy
      ? Object.groupBy(PASSENGER_GROUP_DEFINITIONS, row => row.age_category)
      : PASSENGER_GROUP_DEFINITIONS.reduce((acc, row) => ((acc[row.age_category] ||= []).push(row), acc), {});
    const labels = {adult: '大人', child: '小児', assistant: '介助者'};
    container.innerHTML = Object.entries(grouped).map(([category, definitions]) => `
      <section class="passenger-category" aria-labelledby="passenger-${category}">
        <h3 id="passenger-${category}">${labels[category]}</h3>
        ${definitions.map(definition => {
          const current = this.state.passengers.find(row => row.passenger_group_id === definition.passenger_group_id)?.count || 0;
          return `<div class="passenger-stepper" data-passenger-id="${definition.passenger_group_id}">
            <span>${definition.discount_label}</span>
            <button type="button" data-delta="-1" aria-label="${definition.discount_label}を1人減らす">−</button>
            <input type="number" min="0" max="99" step="1" inputmode="numeric" value="${current}" aria-label="${labels[category]} ${definition.discount_label} 人数">
            <button type="button" data-delta="1" aria-label="${definition.discount_label}を1人増やす">＋</button>
          </div>`;
        }).join('')}
      </section>`).join('');

    container.addEventListener('click', event => {
      const button = event.target.closest('[data-delta]');
      if (!button) return;
      const row = button.closest('[data-passenger-id]');
      const input = row.querySelector('input');
      input.value = Math.max(0, Math.min(99, Number(input.value || 0) + Number(button.dataset.delta)));
      this.updatePassenger(row.dataset.passengerId, input.value);
    });
    container.addEventListener('input', event => {
      const input = event.target.closest('input[type="number"]');
      if (!input) return;
      this.updatePassenger(input.closest('[data-passenger-id]').dataset.passengerId, input.value);
    });
  }

  updatePassenger(id, value) {
    const row = this.state.passengers.find(item => item.passenger_group_id === id);
    if (row) row.count = value === '' ? 0 : Number(value);
    this.renderPassengerRows();
    this.save();
    this.emitChange('passengers');
  }

  renderPassengerRows(calculatedRows = null) {
    const container = this.root.getElementById('passengerTable');
    if (!container) return;
    const active = (calculatedRows || this.state.passengers).filter(row => Number(row.count) > 0);
    if (!active.length) {
      container.innerHTML = '<p class="input-help">大人または小児の人数を入力してください。</p>';
      return;
    }
    container.innerHTML = `<div class="passenger-list">${active.map(row => `
      <article class="passenger-card">
        <strong>${this.escape(row.age_label || this.definition(row.passenger_group_id)?.age_label || row.age_category)}</strong>
        <span>${Number(row.count)}人</span>
        <span>${this.escape(row.discount_label || this.definition(row.passenger_group_id)?.discount_label || row.discount_type)}</span>
        ${row.subtotal != null ? `<b>小計 ${Number(row.subtotal).toLocaleString('ja-JP')}円</b>` : ''}
      </article>`).join('')}</div>`;
  }

  applyRoute(route) {
    const sections = route?.distance?.sections || [];
    this.state.route.distance = route?.distance || null;
    this.state.route.section_services = buildSectionServices(sections, this.state.route.section_services);
    this.renderSectionServices();
    this.save();
  }

  renderSectionServices() {
    const container = this.root.getElementById('sectionServices');
    if (!container) return;
    const sections = this.state.route.distance?.sections || [];
    if (!sections.length) {
      container.innerHTML = '<p class="input-help">経路計算後に区間ごとの列車種別と設備を設定できます。</p>';
      return;
    }
    container.innerHTML = this.state.route.section_services.map((service, index) => {
      const section = sections[index] || {};
      return `<article class="section-service-card" data-section-id="${service.section_id}">
        <h3>${this.escape(section.from)} → ${this.escape(section.to)}</h3>
        <small>${this.escape(section.line || '')}</small>
        <label>列車種別<select data-field="train_type">
          ${this.options([['local','普通'],['rapid','快速'],['express','急行'],['limited_express','特急'],['shinkansen','新幹線']], service.train_type)}
        </select></label>
        <label>設備・席種<select data-field="seat_type">
          ${this.options([['none','設備指定なし'],['non_reserved','自由席'],['reserved','指定席'],['green','グリーン'],['gran_class','グランクラス'],['sleeper','寝台']], service.seat_type)}
        </select></label>
      </article>`;
    }).join('');
    container.onchange = event => {
      const field = event.target.dataset.field;
      if (!field) return;
      const id = event.target.closest('[data-section-id]').dataset.sectionId;
      const service = this.state.route.section_services.find(row => row.section_id === id);
      service[field] = event.target.value;
      service.charge_applicable = service.train_type !== 'local' || service.seat_type !== 'none';
      this.save();
      this.emitChange('section-services');
    };
  }

  bindGeneralInputs() {
    this.root.getElementById('date')?.addEventListener('change', event => {
      this.state.search.travel_date = event.target.value || null;
      this.save(); this.emitChange('calculation');
    });
    this.root.getElementById('company')?.addEventListener('change', event => {
      this.state.search.company_preference = event.target.value || null;
      this.save(); this.emitChange('route');
    });
  }


  restoreSnapshot(snapshot = {}) {
    const search = snapshot.search || snapshot.conditions_v5_1 || {};
    const conditions = snapshot.conditions || {};
    const passengers = snapshot.passengers || conditions.passengers || [];
    const sectionServices = snapshot.section_services || search.section_services || [];

    this.state.search.origin = {
      station_id: search.origin_station_id || null,
      station_name: conditions.start || search.origin_station_name || ''
    };
    this.state.search.destination = {
      station_id: search.destination_station_id || null,
      station_name: conditions.goal || search.destination_station_name || ''
    };
    const viaNames = Array.isArray(conditions.via) ? conditions.via : [];
    const viaIds = Array.isArray(search.via_station_ids) ? search.via_station_ids : [];
    this.state.search.via = viaNames.map((station_name, index) => ({
      station_id: viaIds[index] || null,
      station_name
    }));
    this.state.search.procedure = {
      station_id: search.procedure_station_id || null,
      station_name: conditions.procedure_station_name || search.procedure_station_name || ''
    };
    this.state.search.travel_date = search.travel_date || conditions.travelDate || null;
    this.state.search.company_preference = search.company_preference || conditions.company_id || null;
    this.state.passengers = createPassengerState(passengers);
    this.state.route.section_services = Array.isArray(sectionServices) ? sectionServices : [];

    const fixed = [
      ['start', this.state.search.origin],
      ['goal', this.state.search.destination],
      ['procedureStation', this.state.search.procedure]
    ];
    for (const [id, station] of fixed) {
      const input = this.root.getElementById(id);
      if (!input) continue;
      input.value = station.station_name;
      input.dataset.stationId = station.station_id || '';
    }
    const date = this.root.getElementById('date');
    if (date && this.state.search.travel_date) date.value = this.state.search.travel_date;
    const company = this.root.getElementById('company');
    if (company) company.value = this.state.search.company_preference || '';

    this.renderViaStations();
    this.renderPassengerInputs();
    this.renderPassengerRows();
    this.renderSectionServices();
    this.save();
    this.emitChange('history-restore');
  }

  getOptions() {
    const activePassengers = normalizePassengers({passengers: this.state.passengers});
    return {
      start: this.state.search.origin.station_name,
      goal: this.state.search.destination.station_name,
      via: this.state.search.via.map(row => row.station_name).filter(Boolean),
      origin_station_id: this.state.search.origin.station_id,
      destination_station_id: this.state.search.destination.station_id,
      via_station_ids: this.state.search.via.map(row => row.station_id).filter(Boolean),
      procedure_station_id: this.state.search.procedure.station_id,
      procedure_station_name: this.state.search.procedure.station_name,
      travel_date: this.state.search.travel_date,
      travelDate: this.state.search.travel_date,
      company_preference: this.state.search.company_preference,
      company_id: this.state.search.company_preference,
      passengers: activePassengers,
      passenger_totals: passengerTotals(activePassengers),
      section_services: this.state.route.section_services
    };
  }

  save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
  restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return;
      this.state.search = {...this.state.search, ...saved.search};
      this.state.passengers = createPassengerState(saved.passengers);
      this.state.route = {...this.state.route, ...saved.route};
    } catch { /* 壊れた保存値は無視する。 */ }
  }
  emitChange(scope) { this.root.dispatchEvent(new CustomEvent('mars-killer-v5.1-state-change', {detail: {scope, state: this.state}})); }
  definition(id) { return PASSENGER_GROUP_DEFINITIONS.find(row => row.passenger_group_id === id); }
  options(rows, selected) { return rows.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join(''); }
  escape(value) { const element = document.createElement('span'); element.textContent = value ?? ''; return element.innerHTML; }
}
