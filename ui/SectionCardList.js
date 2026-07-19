import DynamicCardList from './DynamicCardList.js';

export const TRAIN_TYPE_OPTIONS = Object.freeze([
  ['local', '普通'],
  ['rapid', '快速'],
  ['express', '急行'],
  ['limited_express', '特急'],
  ['shinkansen', '新幹線']
]);

export const SEAT_TYPE_OPTIONS = Object.freeze([
  ['none', '設備指定なし'],
  ['non_reserved', '自由席'],
  ['reserved', '指定席'],
  ['green', 'グリーン'],
  ['gran_class', 'グランクラス'],
  ['sleeper', '寝台']
]);

export default class SectionCardList extends DynamicCardList {
  constructor(options) {
    super(options);
    this.stations = [];
  }

  setStations(stations = []) {
    this.stations = stations.map(station => ({...station}));
    this.render();
  }

  createDefaultItem() {
    const first = this.stations[0] || {};
    const last = this.stations[this.stations.length - 1] || first;
    return {
      section_id: `designated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from_station_id: first.station_id ?? null,
      from_station_name: first.station_name ?? '',
      to_station_id: last.station_id ?? null,
      to_station_name: last.station_name ?? '',
      train_type: 'local',
      seat_type: 'none',
      service_name: null,
      service_group_id: null,
      charge_applicable: false
    };
  }

  update(index, field, value) {
    const item = this.items[index];
    if (!item) return;
    if (field === 'from_station' || field === 'to_station') {
      const station = this.stations.find(candidate => this.stationValue(candidate) === value);
      const prefix = field === 'from_station' ? 'from' : 'to';
      item[`${prefix}_station_id`] = station?.station_id ?? null;
      item[`${prefix}_station_name`] = station?.station_name ?? '';
    } else {
      item[field] = value;
    }
    item.charge_applicable = item.train_type !== 'local' || item.seat_type !== 'none';
    this.changed(false);
  }

  renderCard(item, index) {
    const number = index + 1;
    const fromValue = this.itemStationValue(item, 'from');
    const toValue = this.itemStationValue(item, 'to');
    return `
      <article class="entry-card section-entry-card" data-card-index="${index}">
        <div class="entry-card__header">
          <h3>区画${number}</h3>
          <button class="entry-card__delete" type="button" data-card-action="remove" aria-label="区画${number}を削除">削除</button>
        </div>
        <div class="entry-card__fields">
          <label>乗車駅
            <select data-card-field="from_station">
              ${this.stationOptions(fromValue)}
            </select>
          </label>
          <label>降車駅
            <select data-card-field="to_station">
              ${this.stationOptions(toValue)}
            </select>
          </label>
          <label>列車種別
            <select data-card-field="train_type">
              ${this.options(TRAIN_TYPE_OPTIONS, item.train_type)}
            </select>
          </label>
          <label>設備・席種
            <select data-card-field="seat_type">
              ${this.options(SEAT_TYPE_OPTIONS, item.seat_type)}
            </select>
          </label>
        </div>
      </article>`;
  }

  itemStationValue(item, prefix) {
    const station = {
      station_id: item[`${prefix}_station_id`],
      station_name: item[`${prefix}_station_name`]
    };
    return this.stationValue(station);
  }

  stationValue(station) {
    return station.station_id != null ? `id:${station.station_id}` : `name:${station.station_name || ''}`;
  }

  stationOptions(selected) {
    return this.stations.map(station => {
      const value = this.stationValue(station);
      return `<option value="${this.escape(value)}"${value === selected ? ' selected' : ''}>${this.escape(station.station_name)}</option>`;
    }).join('');
  }

  options(rows, selected) {
    return rows.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
  }
}
