
const normalize = value =>
  String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, char =>
      String.fromCharCode(
        char.charCodeAt(0) - 0x60
      )
    )
    .replace(/\s+/g, '');

export default class StationSearchIndex {
  constructor(stations = []) {
    this.records = stations.map((station, index) => {
      const name =
        station.station_name ||
        station.name || '';
      const reading =
        station.station_reading ||
        station.reading ||
        station.kana || '';
      return {
        station_id:
          station.station_id ||
          station.id ||
          `station-${index}`,
        station_name: name,
        station_reading: reading,
        company_id:
          station.company_id || null,
        station_codes: [
          station.station_code,
          station.code,
          station.jr_code
        ].filter(Boolean),
        source: station,
        name_key: normalize(name),
        reading_key: normalize(reading)
      };
    });
  }

  search(query, {limit = 40, companyId = null} = {}) {
    const key = normalize(query);
    if (!key) return [];

    return this.records
      .filter(record =>
        (!companyId ||
          record.company_id === companyId) &&
        (
          record.name_key.includes(key) ||
          record.reading_key.includes(key) ||
          record.station_codes.some(code =>
            normalize(code) === key
          )
        )
      )
      .map(record => ({
        ...record,
        score:
          record.station_codes.some(code =>
            normalize(code) === key
          ) ? 0 :
          record.name_key === key ? 1 :
          record.reading_key === key ? 2 :
          record.name_key.startsWith(key) ? 3 :
          record.reading_key.startsWith(key) ? 4 :
          record.name_key.includes(key) ? 5 : 6
      }))
      .sort((a, b) =>
        a.score - b.score ||
        a.station_reading.localeCompare(
          b.station_reading,
          'ja'
        )
      )
      .slice(0, limit)
      .map(({score, name_key, reading_key, ...record}) => record);
  }
}
