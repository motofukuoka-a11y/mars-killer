
const KEYS = {
  history: 'mars-killer-v5-history',
  favorites: 'mars-killer-v5-favorites',
  recent: 'mars-killer-v5-recent',
  errors: 'mars-killer-v5-errors'
};

const read = key => {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
};

const write = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
};

export default class PracticalStorage {
  history() { return read(KEYS.history); }

  addHistory(entry) {
    return write(
      KEYS.history,
      [{
        id: crypto.randomUUID?.() || String(Date.now()),
        created_at: new Date().toISOString(),
        ...entry
      }, ...this.history()].slice(0, 20)
    );
  }

  clearHistory() {
    localStorage.removeItem(KEYS.history);
    return [];
  }

  favorites() { return read(KEYS.favorites); }

  toggleFavorite(station) {
    const id =
      station.station_id ||
      station.station_name;
    const current = this.favorites();
    const exists = current.some(item =>
      (item.station_id || item.station_name) === id
    );
    return write(
      KEYS.favorites,
      exists
        ? current.filter(item =>
            (item.station_id || item.station_name) !== id
          )
        : [...current, station]
    );
  }

  recentStations() { return read(KEYS.recent); }

  rememberStations(stations) {
    const map = new Map();
    for (const station of [...stations, ...this.recentStations()]) {
      if (!station) continue;
      map.set(
        station.station_id || station.station_name,
        station
      );
    }
    return write(KEYS.recent, [...map.values()].slice(0, 12));
  }

  errorLogs() { return read(KEYS.errors); }

  addError(error, context = {}) {
    return write(
      KEYS.errors,
      [{
        created_at: new Date().toISOString(),
        name: error?.name || 'Error',
        message: error?.message || String(error),
        stack: error?.stack || null,
        context
      }, ...this.errorLogs()].slice(0, 50)
    );
  }
}
