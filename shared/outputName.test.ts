import { describe, expect, it } from 'vitest';
import { outputName, polishDate } from './outputName.js';

describe('outputName', () => {
  it('builds {type}_NP_{yyyymmdd}_{number of the day}', () => {
    expect(outputName('CoA', '2026-10-21', 1)).toBe('CoA_NP_20261021_01');
    expect(outputName('Statement', '2026-01-05', 12)).toBe('Statement_NP_20260105_12');
    expect(outputName('TDS', '2026-10-21', 100)).toBe('TDS_NP_20261021_100');
  });
});

describe('polishDate', () => {
  it('uses the calendar day in Poland, not in UTC', () => {
    // 23:30 UTC is already the next day in Warsaw (UTC+1 in winter, UTC+2 in summer).
    expect(polishDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(polishDate(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15');
    expect(polishDate(new Date('2026-07-14T21:30:00Z'))).toBe('2026-07-14');
  });
});
