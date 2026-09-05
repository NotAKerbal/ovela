import { describe, expect, it } from 'vitest';
import { ovelaMobileGrid } from '../immich/overlay/web/src/lib/utils/ovela-grid';

describe('Ovela mobile photo geometry', () => {
  it.each([308, 378, 418, 730])('fits three square photos per row at width %s without hiding the final row', (width) => {
    const grid = ovelaMobileGrid(8, width);
    const first = grid.getPosition(0);
    const third = grid.getPosition(2);
    const fourth = grid.getPosition(3);
    const last = grid.getPosition(7);
    expect(first.width).toBe(first.height);
    expect(third.left + third.width).toBeCloseTo(width);
    expect(fourth.left).toBe(0);
    expect(fourth.top).toBeCloseTo(first.height + 2);
    expect(last.top + last.height).toBeCloseTo(grid.containerHeight);
    expect(grid.getTop(7)).toBe(last.top);
    expect(grid.getLeft(7)).toBe(last.left);
  });
  it('does not reserve a photo row for an empty library', () => {
    expect(ovelaMobileGrid(0, 378).containerHeight).toBe(0);
  });
});
