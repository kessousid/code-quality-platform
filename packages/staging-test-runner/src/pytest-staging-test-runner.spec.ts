import { describe, expect, it } from 'vitest';
import { makePercentTracker } from './pytest-staging-test-runner.js';

describe('makePercentTracker', () => {
  it('reports the percent from a complete pytest -v output line', () => {
    const percents: number[] = [];
    const track = makePercentTracker((p) => percents.push(p));

    track('tests/test_foo.py::test_bar PASSED                    [ 12%]\n');

    expect(percents).toEqual([12]);
  });

  it('never reports the same percent twice in a row, even across many lines', () => {
    const percents: number[] = [];
    const track = makePercentTracker((p) => percents.push(p));

    track('tests/test_a.py::test_1 PASSED  [  5%]\n');
    track('tests/test_a.py::test_2 PASSED  [  5%]\n');
    track('tests/test_a.py::test_3 PASSED  [  9%]\n');

    expect(percents).toEqual([5, 9]);
  });

  it('correctly parses a percent marker split across two separate chunks', () => {
    const percents: number[] = [];
    const track = makePercentTracker((p) => percents.push(p));

    track('tests/test_foo.py::test_bar PASSED  [ 1');
    track('2%]\n');

    expect(percents).toEqual([12]);
  });

  it('ignores lines with no percent marker at all', () => {
    const percents: number[] = [];
    const track = makePercentTracker((p) => percents.push(p));

    track('============================= test session starts =============================\n');
    track('collected 454 items\n');

    expect(percents).toEqual([]);
  });

  it('reports 100 for the final test', () => {
    const percents: number[] = [];
    const track = makePercentTracker((p) => percents.push(p));

    track('tests/test_z.py::test_last PASSED  [100%]\n');

    expect(percents).toEqual([100]);
  });
});
