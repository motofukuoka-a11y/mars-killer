import createStationAutocomplete from './StationAutocomplete.js';
import {
  PASSENGER_GROUP_DEFINITIONS,
  createPassengerState,
  normalizePassengers,
  passengerTotals
} from '../services/PassengerModel.js';
import {buildSectionServices} from '../services/SectionServiceManager.js';
import PassengerCardList from './PassengerCardList.js';
import SectionCardList from './SectionCardList.js';

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
    this.passengerCardList = null;
    this.sectionCardList = null;
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
    this.setupPassengerCards();
    this.setupSectionCards();
    this.renderPassengerInputs();
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

  setupPassengerCards() {
    this.passengerCardList = new PassengerCardList({
      container: this.root.getElementById('passengerGroups'),
      addButton: this.root.getElementById('addPassenger'),
      itemName: '旅客',
      onChange: cards => this.applyPassengerCards(cards)
    }).init();
  }

  setupSectionCards() {
    this.sectionCardList = new SectionCardList({
      container: this.root.getElementById('sectionServices'),
      addButton: this.root.getElementById('addSectionService'),
      itemName: '指定区画',
      onChange: services => {
        this.state.route.section_services = services;
        this.save();
        this.emitChange('section-services');
      }
    }).init();
  }

  passengerCardsFromState() {
    const cards = this.state.passengers
      .filter(row => Number(row.count) > 0)
      .map(row => ({
        age_category: row.age_category,
        discount_type: row.discount_type === 'assistant_normal' ? 'none' : row.discount_type,
        count: Number(row.count)
      }));
    return cards.length ? cards : [{age_category: 'adult', discount_type: 'none', count: 1}];
  }

  renderPassengerInputs() {
    this.passengerCardList?.setItems(this.passengerCardsFromState());
  }

  applyPassengerCards(cards) {
    const next = createPassengerState();
    for (const card of cards) {
      const definition = PASSENGER_GROUP_DEFINITIONS.find(row =>
        row.age_category === card.age_category &&
        row.discount_type === card.discount_type
      );
      if (!definition) continue;
      const target = next.find(row => row.passenger_group_id === definition.passenger_group_id);
      if (target) target.count += Math.max(1, Math.min(99, Number(card.count) || 1));
    }
    this.state.passengers = next;
    this.save();
    this.emitChange('passengers');
  }

  renderPassengerRows() {
    // 入力はPassengerCardListへ集約。計算結果はapp.jsの結果カードで表示する。
  }

  routeStations() {
    const sections = this.state.route.distance?.sections || [];
    const stations = [];
    const seen = new Set();
    const append = (stationId, stationName) => {
      const key = stationId != null ? `id:${stationId}` : `name:${stationName || ''}`;
      if (!stationName || seen.has(key)) return;
      seen.add(key);
      stations.push({station_id: stationId ?? null, station_name: stationName});
    };
    for (const section of sections) {
      append(section.from_station_id, section.from);
      append(section.to_station_id, section.to);
    }
    return stations;
  }

  applyRoute(route) {
    const sections = route?.distance?.sections || [];
    const hadServices = this.state.route.section_services.length > 0;
    this.state.route.distance = route?.distance || null;
    if (!hadServices) {
      this.state.route.section_services = buildSectionServices(sections, []);
    }
    this.renderSectionServices();
    this.save();
  }

  renderSectionServices() {
    if (!this.sectionCardList) return;
    const stations = this.routeStations();
    this.sectionCardList.setStations(stations);
    if (!stations.length) {
      this.sectionCardList.setItems([]);
      const container = this.root.getElementById('sectionServices');
      if (container) container.innerHTML = '<p class="input-help">経路計算後に指定区画を追加できます。</p>';
      const addButton = this.root.getElementById('addSectionService');
      if (addButton) addButton.disabled = true;
      return;
    }
    const addButton = this.root.getElementById('addSectionService');
    if (addButton) addButton.disabled = false;
    const services = this.state.route.section_services.length
      ? this.state.route.section_services
      : [this.sectionCardList.createDefaultItem()];
    this.sectionCardList.setItems(services.map(service => {
      const from = stations.find(station => station.station_id != null && station.station_id === service.from_station_id)
        || stations.find(station => station.station_name === service.from_station_name)
        || stations[0];
      const to = stations.find(station => station.station_id != null && station.station_id === service.to_station_id)
        || stations.find(station => station.station_name === service.to_station_name)
        || stations[stations.length - 1];
      return {
        ...service,
        from_station_id: from?.station_id ?? null,
        from_station_name: from?.station_name ?? '',
        to_station_id: to?.station_id ?? null,
        to_station_name: to?.station_name ?? ''
      };
    }));
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
