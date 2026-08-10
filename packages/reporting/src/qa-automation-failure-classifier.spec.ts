import { describe, expect, it } from 'vitest';
import {
  classifyFailureReason,
  isPossibleHang,
  isSkipped,
  skipReason,
} from './qa-automation-failure-classifier.js';

describe('classifyFailureReason', () => {
  it('recognizes a missing-credentials RuntimeError', () => {
    expect(
      classifyFailureReason('RuntimeError: Missing credentials for newmentor: NEWMENTOR_EMAIL'),
    ).toBe('Missing credentials (env var mismatch)');
  });

  it('recognizes a login flow that never completed', () => {
    expect(classifyFailureReason('RuntimeError: Login did not reach /app/ after 60.0s.')).toBe(
      'Login flow did not complete',
    );
  });

  it('recognizes a logout that did not complete', () => {
    expect(
      classifyFailureReason('Exception: Logout did not result in unauthenticated state.'),
    ).toBe('Logout did not complete');
  });

  it('recognizes a missing-import NameError', () => {
    expect(classifyFailureReason("NameError: name 'random' is not defined")).toBe(
      'Test code bug: missing import',
    );
  });

  it('recognizes an undefined-method AttributeError', () => {
    expect(
      classifyFailureReason(
        "AttributeError: 'TestMentorScheduling' object has no attribute '_login_and_go'",
      ),
    ).toBe('Test code bug: undefined method/attribute');
  });

  it('recognizes a Playwright timeout even without the literal word "TimeoutError"', () => {
    expect(
      classifyFailureReason(
        'Timeout 30000ms exceeded.\n  - waiting for get_by_role("dialog")\n  - waiting 500ms',
      ),
    ).toBe('Playwright timeout waiting for an element/condition');
  });

  it('recognizes a real assertion failure', () => {
    expect(
      classifyFailureReason(
        '>       raise AssertionError(\nE       AssertionError: No COD job found.',
      ),
    ).toBe('Assertion failure (content/state mismatch)');
  });

  it('falls back to "Other / unclassified" for anything unrecognized', () => {
    expect(classifyFailureReason('some completely novel failure text')).toBe(
      'Other / unclassified',
    );
  });
});

describe('isSkipped / skipReason', () => {
  it('recognizes the SKIPPED: prefix stamped by the JUnit parser', () => {
    expect(isSkipped('SKIPPED: no reason recorded')).toBe(true);
    expect(isSkipped('Passed.')).toBe(false);
  });

  it('strips the prefix to get the real reason', () => {
    expect(skipReason('SKIPPED: Hangs indefinitely')).toBe('Hangs indefinitely');
  });
});

describe('isPossibleHang', () => {
  it('flags a skip reason mentioning a hang', () => {
    expect(isPossibleHang('SKIPPED: Hangs indefinitely')).toBe(true);
  });

  it('does not flag an unrelated skip reason', () => {
    expect(isPossibleHang('SKIPPED: 404 in this environment')).toBe(false);
  });
});
