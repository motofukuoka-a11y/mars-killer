import { ErrorCodes } from './ErrorCodes.js';
import {
  DistanceComparison
} from './Constants.js';

/**
 * 金額を日本円表記へ変換する。
 */
export function formatYen(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw createBusinessError(
      ErrorCodes.INVALID_NUMBER,
      `金額が不正です: ${value}`,
      { value }
    );
  }

  return `${number.toLocaleString('ja-JP')}円`;
}

/**
 * 営業キロを指定単位で切り上げる。
 */
export function ceilBusinessKm(
  businessKm,
  unit = 1
) {
  const km = toFiniteNumber(
    businessKm,
    'businessKm'
  );
  const step = toFiniteNumber(unit, 'unit');

  if (km < 0 || step <= 0) {
    throw createBusinessError(
      ErrorCodes.DISTANCE,
      '営業キロまたは切上げ単位が不正です。',
      { businessKm, unit }
    );
  }

  return Math.ceil(km / step) * step;
}

/**
 * 営業キロを比較する。
 */
export function compareBusinessKm(
  actualKm,
  thresholdKm,
  comparison =
    DistanceComparison.GREATER_THAN_OR_EQUAL
) {
  const actual = toFiniteNumber(
    actualKm,
    'actualKm'
  );
  const threshold = toFiniteNumber(
    thresholdKm,
    'thresholdKm'
  );

  switch (comparison) {
    case DistanceComparison.GREATER_THAN:
      return actual > threshold;
    case DistanceComparison
      .GREATER_THAN_OR_EQUAL:
      return actual >= threshold;
    case DistanceComparison.LESS_THAN:
      return actual < threshold;
    case DistanceComparison
      .LESS_THAN_OR_EQUAL:
      return actual <= threshold;
    case DistanceComparison.EQUAL:
      return actual === threshold;
    default:
      throw createBusinessError(
        ErrorCodes.UNSUPPORTED_OPERATION,
        `未対応の営業キロ比較です: ${comparison}`,
        { comparison }
      );
  }
}

/**
 * JSON読込補助。
 */
export async function loadJson(
  path,
  fetcher = fetch
) {
  if (!path) {
    throw createBusinessError(
      ErrorCodes.REQUIRED_FIELD,
      'JSONのパスが必要です。',
      { field: 'path' }
    );
  }

  try {
    const response = await fetcher(path);

    if (!response.ok) {
      throw createBusinessError(
        ErrorCodes.JSON_LOAD_FAILED,
        `${path} の読込みに失敗しました。`,
        {
          path,
          status: response.status
        }
      );
    }

    return await response.json();
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    throw createBusinessError(
      ErrorCodes.JSON_LOAD_FAILED,
      `${path} の読込みに失敗しました。`,
      {
        path,
        cause: error?.message
      }
    );
  }
}

/**
 * 有限数かを判定する。
 */
export function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

/**
 * 有限数へ変換する。
 */
export function toFiniteNumber(
  value,
  field = 'value'
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw createBusinessError(
      ErrorCodes.INVALID_NUMBER,
      `${field}が数値ではありません。`,
      { field, value }
    );
  }

  return number;
}

/**
 * 共通例外を生成する。
 */
export function createBusinessError(
  code,
  message,
  details = {}
) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
