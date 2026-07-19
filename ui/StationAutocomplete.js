const DEFAULT_LIMIT = 20;

export default function createStationAutocomplete({
  inputElement,
  resultElement,
  stationSearchIndex,
  onSelect,
  companyId = () => null,
  allowEmpty = false,
  limit = DEFAULT_LIMIT
}) {
  let rows = [];
  let activeIndex = -1;

  inputElement.setAttribute('role', 'combobox');
  inputElement.setAttribute('aria-autocomplete', 'list');
  inputElement.setAttribute('aria-controls', resultElement.id);
  inputElement.setAttribute('aria-expanded', 'false');
  resultElement.setAttribute('role', 'listbox');

  const close = () => {
    resultElement.hidden = true;
    resultElement.innerHTML = '';
    inputElement.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  };

  const select = index => {
    const station = rows[index];
    if (!station) return;
    inputElement.value = station.station_name;
    inputElement.dataset.stationId = station.station_id;
    onSelect?.(station);
    close();
  };

  const render = () => {
    const query = inputElement.value;
    inputElement.dataset.stationId = '';
    if (!query.trim()) {
      if (!allowEmpty) close();
      return;
    }

    rows = stationSearchIndex.search(query, {limit, companyId: companyId()});
    resultElement.innerHTML = rows.length
      ? rows.map((station, index) => `
        <button type="button" role="option" class="candidate" data-index="${index}" aria-selected="false">
          <strong>${station.station_name}</strong>
          <span>${station.station_name_kana || ''}</span>
          <small>${[station.line_name, station.company_name].filter(Boolean).join('・')}</small>
        </button>`).join('')
      : '<p class="candidate-empty" role="status">該当する駅がありません。</p>';
    resultElement.hidden = false;
    inputElement.setAttribute('aria-expanded', 'true');
  };

  const updateActive = nextIndex => {
    if (!rows.length) return;
    activeIndex = (nextIndex + rows.length) % rows.length;
    resultElement.querySelectorAll('[role="option"]').forEach((element, index) => {
      const selected = index === activeIndex;
      element.setAttribute('aria-selected', String(selected));
      if (selected) element.scrollIntoView({block: 'nearest'});
    });
  };

  inputElement.addEventListener('input', render);
  inputElement.addEventListener('focus', render);
  inputElement.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); updateActive(activeIndex + 1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); updateActive(activeIndex - 1); }
    if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); select(activeIndex); }
    if (event.key === 'Escape') close();
  });
  resultElement.addEventListener('click', event => {
    const option = event.target.closest('[data-index]');
    if (option) select(Number(option.dataset.index));
  });
  document.addEventListener('pointerdown', event => {
    if (event.target !== inputElement && !resultElement.contains(event.target)) close();
  });

  return {render, close, getSelectedStationId: () => inputElement.dataset.stationId || null};
}
