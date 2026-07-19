import { ErrorCodes } from '../shared/ErrorCodes.js';
import {
  PassengerType
} from '../shared/Constants.js';
import {
  isFiniteNumber
} from '../shared/Utils.js';

/**
 * 入力検証のみを担当する。
 */
export default class ValidationEngine {

  validate(input = {}) {
    const type = input.type || 'quote';

    switch (type) {
      case 'quote':
        return this.validateQuote(input);
      case 'discount':
        return this.validateDiscount(input);
      case 'refund':
        return this.validateRefund(input);
      case 'rules':
        return this.validateRules(input);
      case 'business':
        return this.validateBusiness(input);
      case 'business_regulations':
        return this.validateBusinessRegulations(input);
      case 'master_database':
        return this.validateMasterDatabase(input);
      case 'railway_master_database':
        return this.validateRailwayMasterDatabase(input);
      default:
        return this.invalid(
          ErrorCodes.UNSUPPORTED_OPERATION,
          `未対応の検証種別です: ${type}`
        );
    }
  }

  validateQuote(input) {
    const required = this.requiredFields(
      input,
      ['start', 'goal']
    );

    if (!required.valid) {
      return required;
    }

    if (input.start === input.goal) {
      return this.invalid(
        ErrorCodes.INVALID_STATION,
        '発駅と着駅が同一です。',
        {
          start: input.start,
          goal: input.goal
        }
      );
    }

    if (
      input.passenger != null &&
      !Object.values(PassengerType)
        .includes(input.passenger)
    ) {
      return this.invalid(
        ErrorCodes.INVALID_PASSENGER_TYPE,
        `旅客区分が不正です: ${input.passenger}`
      );
    }

    return this.valid();
  }

  validateDiscount(input) {
    const required = this.requiredFields(
      input,
      [
        'discountType',
        'beforeDiscountYen'
      ]
    );

    if (!required.valid) {
      return required;
    }

    if (
      !isFiniteNumber(
        input.beforeDiscountYen
      ) ||
      Number(input.beforeDiscountYen) < 0
    ) {
      return this.invalid(
        ErrorCodes.INVALID_NUMBER,
        '割引前金額が不正です。',
        {
          beforeDiscountYen:
            input.beforeDiscountYen
        }
      );
    }

    if (
      input.businessKm != null &&
      (
        !isFiniteNumber(input.businessKm) ||
        Number(input.businessKm) < 0
      )
    ) {
      return this.invalid(
        ErrorCodes.DISTANCE,
        '営業キロが不正です。',
        { businessKm: input.businessKm }
      );
    }

    return this.valid();
  }

  validateRefund(input) {
    const required = this.requiredFields(
      input,
      [
        'ticketType',
        'status',
        'amountYen'
      ]
    );

    if (!required.valid) {
      return required;
    }

    if (!isFiniteNumber(input.amountYen)) {
      return this.invalid(
        ErrorCodes.INVALID_NUMBER,
        '払戻対象額が不正です。',
        { amountYen: input.amountYen }
      );
    }

    return this.valid();
  }

  validateBusiness(input) {
    const required = this.requiredFields(input, [
      'requestDate', 'ticketType', 'ticketUsageType',
      'departureStatus', 'operation'
    ]);
    if (!required.valid) {
      const codes = {
        requestDate: ErrorCodes.INVALID_DATE,
        operation: ErrorCodes.INVALID_OPERATION,
        departureStatus: ErrorCodes.INVALID_DEPARTURE_STATUS
      };
      return this.invalid(codes[required.details.field] || required.error_code, required.message, required.details);
    }
    const requestDate = this.parseDate(input.requestDate);
    if (!requestDate) return this.invalid(ErrorCodes.INVALID_DATE, '申出日が不正です。');
    const usageRule = input.businessRules?.ticket_usage_types?.[input.ticketUsageType];
    if (!usageRule) return this.invalid(ErrorCodes.INVALID_TICKET_TYPE, `きっぷ利用形態が不正です: ${input.ticketUsageType}`);
    if (usageRule.requires_start_date && !input.ticketStartDate) return this.invalid(ErrorCodes.INVALID_PERIOD, '有効開始日が必要です。');
    if (usageRule.requires_end_date && !input.ticketEndDate) return this.invalid(ErrorCodes.INVALID_PERIOD, '有効終了日が必要です。');
    const startDate = input.ticketStartDate ? this.parseDate(input.ticketStartDate) : requestDate;
    const endDate = input.ticketEndDate ? this.parseDate(input.ticketEndDate) : startDate;
    if (!startDate || !endDate) return this.invalid(ErrorCodes.INVALID_DATE, '有効期間の日付が不正です。');
    if (startDate > endDate) return this.invalid(ErrorCodes.INVALID_PERIOD, '有効開始日が有効終了日より後です。');
    if (!input.businessRules?.operations?.[input.operation]) return this.invalid(ErrorCodes.INVALID_OPERATION, `営業実務が不正です: ${input.operation}`);
    if (!input.businessRules?.departure_statuses?.includes(input.departureStatus)) return this.invalid(ErrorCodes.INVALID_DEPARTURE_STATUS, `列車状態が不正です: ${input.departureStatus}`);
    return this.valid({ requestDate, startDate, endDate });
  }

  validateBusinessRegulations(input) {
    const regulations =
      input.businessRegulations?.regulations;

    if (!Array.isArray(regulations)) {
      return this.invalid(
        ErrorCodes.JSON_MISSING,
        '営業規則JSONが不足しています。',
        {
          field: 'businessRegulations.regulations'
        }
      );
    }

    if (regulations.length === 0) {
      return this.invalid(
        ErrorCodes.RULE_NOT_FOUND,
        '営業規則が登録されていません。'
      );
    }

    const missingByRegulation = {};

    for (const regulation of regulations) {
      const missing = (
        regulation.required_fields || []
      ).filter(field =>
        input.context?.[field] == null ||
        input.context?.[field] === ''
      );

      if (missing.length > 0) {
        missingByRegulation[
          regulation.regulation_id
        ] = missing;
      }
    }

    return this.valid({
      missing_by_regulation:
        missingByRegulation
    });
  }

  validateMasterDatabase(input) {
    const masters = input.masters;

    if (
      !masters ||
      typeof masters !== 'object'
    ) {
      return this.invalid(
        ErrorCodes.MASTER_MISSING,
        'マスター群が不足しています。'
      );
    }

    const requiredMasters = [
      'business_regulation_master',
      'station_group_master',
      'route_rule_master',
      'validity_rule_master'
    ];

    for (const name of requiredMasters) {
      if (!masters[name]) {
        return this.invalid(
          ErrorCodes.MASTER_MISSING,
          `必須マスターが不足しています: ${name}`,
          { master: name }
        );
      }
    }

    const masterFields = [
      'id',
      'name',
      'enabled',
      'description',
      'references',
      'priority',
      'metadata',
      'records'
    ];

    const recordFields = [
      'id',
      'enabled',
      'name',
      'description',
      'conditions',
      'references',
      'metadata',
      'priority'
    ];

    const masterIds = new Set();
    const nodes = new Map();
    const resolvedRules = [];

    for (
      const [masterName, master] of
      Object.entries(masters)
    ) {
      for (const field of masterFields) {
        if (master[field] == null) {
          return this.invalid(
            ErrorCodes.REQUIRED_FIELD,
            `${masterName}.${field}は必須です。`,
            {
              master: masterName,
              field
            }
          );
        }
      }

      if (masterIds.has(master.id)) {
        return this.invalid(
          ErrorCodes.MASTER_DUPLICATE,
          `マスターIDが重複しています: ${
            master.id
          }`,
          {
            master: masterName,
            id: master.id
          }
        );
      }

      masterIds.add(master.id);

      const recordIds = new Set();

      for (
        const record of
        master.records || []
      ) {
        for (const field of recordFields) {
          if (record[field] == null) {
            return this.invalid(
              ErrorCodes.REQUIRED_FIELD,
              `${masterName}/${
                record.id || 'unknown'
              }.${field}は必須です。`,
              {
                master: masterName,
                id: record.id,
                field
              }
            );
          }
        }

        if (recordIds.has(record.id)) {
          return this.invalid(
            ErrorCodes.MASTER_DUPLICATE,
            `マスター内でIDが重複しています: ${
              masterName
            }/${record.id}`,
            {
              master: masterName,
              id: record.id
            }
          );
        }

        recordIds.add(record.id);

        nodes.set(
          `${masterName}:${record.id}`,
          record.references || []
        );
      }
    }

    const central =
      masters.business_regulation_master;

    for (
      const reference of
      central.references || []
    ) {
      if (
        !reference.id ||
        ![
          'station_group_master',
          'route_rule_master',
          'validity_rule_master'
        ].includes(reference.master)
      ) {
        continue;
      }

      const targetMaster =
        masters[reference.master];

      if (!targetMaster) {
        return this.invalid(
          ErrorCodes.MASTER_MISSING,
          `参照マスターが不足しています: ${
            reference.master
          }`,
          { reference }
        );
      }

      const rule = (
        targetMaster.records || []
      ).find(
        item => item.id === reference.id
      );

      if (!rule) {
        return this.invalid(
          ErrorCodes.RULE_NOT_FOUND,
          `参照規則が見つかりません: ${
            reference.master
          }/${reference.id}`,
          { reference }
        );
      }

      if (
        targetMaster.enabled !== false &&
        rule.enabled !== false
      ) {
        resolvedRules.push({
          master: reference.master,
          id: rule.id,
          priority: rule.priority
        });
      }
    }

    const priorities = new Map();

    for (const rule of resolvedRules) {
      if (priorities.has(rule.priority)) {
        return this.invalid(
          ErrorCodes.PRIORITY_CONFLICT,
          `優先順位が競合しています: ${
            rule.priority
          }`,
          {
            priority: rule.priority,
            ids: [
              priorities.get(
                rule.priority
              ),
              `${rule.master}:${rule.id}`
            ]
          }
        );
      }

      priorities.set(
        rule.priority,
        `${rule.master}:${rule.id}`
      );
    }

    const visiting = new Set();
    const visited = new Set();
    const path = [];

    const visit = node => {
      if (visiting.has(node)) {
        const index =
          path.indexOf(node);

        return [
          ...path.slice(index),
          node
        ];
      }

      if (visited.has(node)) {
        return null;
      }

      visiting.add(node);
      path.push(node);

      for (
        const reference of
        nodes.get(node) || []
      ) {
        if (
          !reference.master ||
          !reference.id
        ) {
          continue;
        }

        const next =
          `${reference.master}:${
            reference.id
          }`;

        if (!nodes.has(next)) {
          continue;
        }

        const cycle = visit(next);

        if (cycle) {
          return cycle;
        }
      }

      path.pop();
      visiting.delete(node);
      visited.add(node);

      return null;
    };

    for (const node of nodes.keys()) {
      const cycle = visit(node);

      if (cycle) {
        return this.invalid(
          ErrorCodes.CIRCULAR_REFERENCE,
          `循環参照を検出しました: ${
            cycle.join(' -> ')
          }`,
          { cycle }
        );
      }
    }

    return this.valid({
      resolved_rule_count:
        resolvedRules.length
    });
  }

  validateRailwayMasterDatabase(input) {
    const masters = input.masters || {};

    const required = [
      'company_master',
      'line_master',
      'station_master',
      'distance_master',
      'fare_master',
      'charge_master'
    ];

    for (const name of required) {
      if (!masters[name]) {
        return this.invalid(
          ErrorCodes.MASTER_MISSING,
          `鉄道マスターが不足しています: ${name}`,
          { master: name }
        );
      }
    }

    const duplicateInMaster = (
      masterName,
      errorCode,
      label
    ) => {
      const ids = new Set();

      for (
        const record of
        masters[masterName].records || []
      ) {
        if (ids.has(record.id)) {
          return this.invalid(
            errorCode,
            `${label}IDが重複しています: ${
              record.id
            }`,
            {
              master: masterName,
              id: record.id
            }
          );
        }

        ids.add(record.id);
      }

      return null;
    };

    for (const result of [
      duplicateInMaster(
        'company_master',
        ErrorCodes.COMPANY_DUPLICATE,
        '会社'
      ),
      duplicateInMaster(
        'line_master',
        ErrorCodes.LINE_DUPLICATE,
        '路線'
      ),
      duplicateInMaster(
        'station_master',
        ErrorCodes.STATION_DUPLICATE,
        '駅'
      ),
      duplicateInMaster(
        'distance_master',
        ErrorCodes.DISTANCE_DUPLICATE,
        '営業キロ'
      )
    ]) {
      if (result) {
        return result;
      }
    }

    const base =
      this.validateMasterDatabase(input);

    if (!base.valid) {
      return base;
    }

    const companies =
      input.resolved?.companies || [];
    const lines =
      input.resolved?.lines || [];
    const stations =
      input.resolved?.stations || [];
    const distances =
      input.resolved?.distances || [];

    const duplicateResolved = (
      rows,
      errorCode,
      label
    ) => {
      const ids = new Set();

      for (const row of rows) {
        if (ids.has(row.id)) {
          return this.invalid(
            errorCode,
            `${label}IDが重複しています: ${
              row.id
            }`,
            { id: row.id }
          );
        }

        ids.add(row.id);
      }

      return null;
    };

    for (const result of [
      duplicateResolved(
        companies,
        ErrorCodes.COMPANY_DUPLICATE,
        '会社'
      ),
      duplicateResolved(
        lines,
        ErrorCodes.LINE_DUPLICATE,
        '路線'
      ),
      duplicateResolved(
        stations,
        ErrorCodes.STATION_DUPLICATE,
        '駅'
      ),
      duplicateResolved(
        distances,
        ErrorCodes.DISTANCE_DUPLICATE,
        '営業キロ'
      )
    ]) {
      if (result) {
        return result;
      }
    }

    const companyIds =
      new Set(
        companies.map(item => item.id)
      );

    const lineIds =
      new Set(
        lines.map(item => item.id)
      );

    const stationIds =
      new Set(
        stations.map(item => item.id)
      );

    for (const line of lines) {
      const companyId =
        line.metadata?.company_id;

      if (
        companyId &&
        !companyIds.has(companyId)
      ) {
        return this.invalid(
          ErrorCodes
            .COMPANY_REFERENCE_NOT_FOUND,
          `存在しない会社を参照しています: ${
            companyId
          }`,
          {
            line_id: line.id,
            company_id: companyId
          }
        );
      }
    }

    const usedLines = new Set();
    const usedStations = new Set();

    for (const distance of distances) {
      const metadata =
        distance.metadata || {};

      if (
        metadata.line_id &&
        !lineIds.has(metadata.line_id)
      ) {
        return this.invalid(
          ErrorCodes.LINE_REFERENCE_NOT_FOUND,
          `存在しない路線を参照しています: ${
            metadata.line_id
          }`,
          {
            distance_id: distance.id,
            line_id: metadata.line_id
          }
        );
      }

      for (
        const field of [
          'from_station_id',
          'to_station_id'
        ]
      ) {
        const stationId = metadata[field];

        if (
          stationId &&
          !stationIds.has(stationId)
        ) {
          return this.invalid(
            ErrorCodes
              .STATION_REFERENCE_NOT_FOUND,
            `存在しない駅を参照しています: ${
              stationId
            }`,
            {
              distance_id: distance.id,
              station_id: stationId
            }
          );
        }

        if (stationId) {
          usedStations.add(stationId);
        }
      }

      if (metadata.line_id) {
        usedLines.add(metadata.line_id);
      }
    }

    const orphanStation =
      stations.find(
        station =>
          !usedStations.has(station.id)
      );

    if (orphanStation) {
      return this.invalid(
        ErrorCodes.ORPHAN_STATION,
        `距離マスターへ接続されていない駅です: ${
          orphanStation.id
        }`,
        {
          station_id: orphanStation.id
        }
      );
    }

    const orphanLine =
      lines.find(
        line => !usedLines.has(line.id)
      );

    if (orphanLine) {
      return this.invalid(
        ErrorCodes.ORPHAN_LINE,
        `距離マスターから参照されていない路線です: ${
          orphanLine.id
        }`,
        {
          line_id: orphanLine.id
        }
      );
    }

    return this.valid({
      company_count: companies.length,
      line_count: lines.length,
      station_count: stations.length,
      distance_count: distances.length
    });
  }

  parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  validateRules(input) {
    if (!Array.isArray(input.rules)) {
      return this.invalid(
        ErrorCodes.JSON_MISSING,
        '規則JSONが不足しています。',
        { field: 'rules' }
      );
    }

    if (input.rules.length === 0) {
      return this.invalid(
        ErrorCodes.RULE_NOT_FOUND,
        '規則JSONにルールがありません。'
      );
    }

    return this.valid();
  }

  requiredFields(input, fields) {
    for (const field of fields) {
      const value = input[field];

      if (
        value == null ||
        (
          typeof value === 'string' &&
          value.trim() === ''
        )
      ) {
        return this.invalid(
          ErrorCodes.REQUIRED_FIELD,
          `${field}は必須です。`,
          { field }
        );
      }
    }

    return this.valid();
  }

  valid(details = {}) {
    return {
      valid: true,
      error_code: null,
      message: null,
      details
    };
  }

  invalid(
    errorCode,
    message,
    details = {}
  ) {
    return {
      valid: false,
      error_code: errorCode,
      message,
      details
    };
  }
}
