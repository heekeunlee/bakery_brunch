import type { UserRecord } from '../types';

const KEY = 'bakery-brunch:records:v1';

/** 위시리스트와 방문 기록은 전부 기기 안에만 둔다. 서버도 계정도 없다. */
export function loadRecords(): Record<string, UserRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveRecords(records: Record<string, UserRecord>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* 사파리 프라이빗 모드 등에서 실패할 수 있으나 앱 동작은 계속되어야 한다 */
  }
}

export function exportRecords(): string {
  return JSON.stringify(loadRecords(), null, 2);
}

/** 기기 교체 시 사용. 기존 기록 위에 병합한다. */
export function importRecords(json: string): number {
  const incoming = JSON.parse(json) as Record<string, UserRecord>;
  const merged = { ...loadRecords(), ...incoming };
  saveRecords(merged);
  return Object.keys(incoming).length;
}
