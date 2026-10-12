import type { RunRef } from '../../../shared/schema.ts';

export const runKey = (ref: RunRef) => `${ref.blockId}:${ref.cell.join('_')}:${ref.run}`;
export const runDomId = (ref: RunRef) => `run-${runKey(ref).replace(/[^\w-]/g, '-')}`;
