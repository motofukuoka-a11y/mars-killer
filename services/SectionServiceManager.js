export const TRAIN_TYPES = Object.freeze(['local', 'rapid', 'express', 'limited_express', 'shinkansen']);
export const SEAT_TYPES = Object.freeze(['none', 'non_reserved', 'reserved', 'green', 'gran_class', 'sleeper']);

const stableSectionId = section => {
  if (section.segment_id) return String(section.segment_id);
  const parts = [section.from_station_id ?? section.from, section.line_id ?? section.line, section.to_station_id ?? section.to];
  return `section-${parts.map(value => encodeURIComponent(String(value ?? 'unknown'))).join('-')}`;
};

export function buildSectionServices(sections = [], previous = []) {
  const prior = new Map(previous.map(service => [service.section_id, service]));
  return sections.map(section => {
    const sectionId = stableSectionId(section);
    const existing = prior.get(sectionId);
    return {
      section_id: sectionId,
      from_station_id: section.from_station_id ?? null,
      to_station_id: section.to_station_id ?? null,
      train_type: existing?.train_type ?? 'local',
      seat_type: existing?.seat_type ?? 'none',
      service_name: existing?.service_name ?? null,
      service_group_id: existing?.service_group_id ?? null,
      charge_applicable: existing?.charge_applicable ?? false
    };
  });
}

export function validateSectionServices(sectionServices = []) {
  const errors = [];
  const warnings = [];

  if (!sectionServices.length) errors.push('経路区間が設定されていません。');

  for (const service of sectionServices) {
    if (!TRAIN_TYPES.includes(service.train_type)) {
      errors.push(`${service.section_id}の列車種別が不正です。`);
    }
    if (!SEAT_TYPES.includes(service.seat_type)) {
      errors.push(`${service.section_id}の設備・席種が不正です。`);
    }
    if (service.train_type === 'local' && service.seat_type === 'gran_class') {
      warnings.push(`${service.section_id}の普通列車とグランクラスの組合せを確認してください。`);
    }
  }

  return {errors, warnings, infos: [], isValid: errors.length === 0};
}
