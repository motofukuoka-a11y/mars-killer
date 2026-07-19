const normalizeKana = value => String(value || '').replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));

export const normalizeStationSearchText = value =>
  normalizeKana(String(value || '').normalize('NFKC'))
    .trim()
    .toLowerCase()
    .replace(/[\u3000\s]+/g, '');

const firstValue = (...values) => values.find(value => value !== null && value !== undefined && value !== '') ?? '';
const toArray = value => Array.isArray(value) ? value : value ? [value] : [];

export default class StationSearchIndex {
  constructor(stations = [], {lineLookup = null, companyLookup = null} = {}) {
    this.records = stations.map((station, index) => {
      const stationName = firstValue(station.station_name, station.name);
      const stationNameKana = firstValue(station.station_name_kana, station.station_reading, station.reading, station.kana);
      const stationId = firstValue(station.station_id, station.id, `station-${index}`);
      const lineIds = toArray(firstValue(station.line_ids, station.line_id, station.lines));
      const companyId = firstValue(station.company_id, station.operator_id, null);
      const lineName = firstValue(station.line_name, lineLookup?.(lineIds[0])?.line_name, '');
      const companyName = firstValue(station.company_name, companyLookup?.(companyId)?.company_name, '');
      const stationCodes = [station.station_code, station.code, station.jr_code].filter(Boolean);

      return {
        station_id: stationId,
        station_name: stationName,
        station_name_kana: stationNameKana,
        station_name_normalized: normalizeStationSearchText(stationName),
        station_code: stationCodes[0] ?? null,
        station_codes: stationCodes,
        line_ids: lineIds,
        company_id: companyId || null,
        line_name: lineName,
        company_name: companyName,
        source: station,
        name_key: normalizeStationSearchText(stationName),
        reading_key: normalizeStationSearchText(stationNameKana),
        code_keys: stationCodes.map(normalizeStationSearchText),
        source_order: index
      };
    });

    this.byId = new Map(this.records.map(record => [record.station_id, record]));
  }

  getById(stationId) {
    return this.byId.get(stationId) ?? null;
  }

  search(query, {limit = 20, companyId = null} = {}) {
    const key = normalizeStationSearchText(query);
    if (!key) return [];

    return this.records
      .filter(record => (!companyId || record.company_id === companyId) && (
        record.name_key.includes(key) ||
        record.reading_key.includes(key) ||
        record.code_keys.some(code => code.includes(key))
      ))
      .map(record => ({...record, score: this.score(record, key)}))
      .sort((a, b) =>
        a.score - b.score ||
        a.station_name_kana.localeCompare(b.station_name_kana, 'ja') ||
        a.station_name.localeCompare(b.station_name, 'ja') ||
        a.source_order - b.source_order
      )
      .slice(0, Math.max(1, Number(limit) || 20))
      .map(({score, name_key, reading_key, code_keys, source_order, ...record}) => record);
  }

  score(record, key) {
    if (record.name_key === key) return 0;
    if (record.reading_key === key) return 1;
    if (record.name_key.startsWith(key)) return 2;
    if (record.reading_key.startsWith(key)) return 3;
    if (record.code_keys.some(code => code === key)) return 4;
    if (record.name_key.includes(key)) return 5;
    if (record.reading_key.includes(key)) return 6;
    return 7;
  }
}
