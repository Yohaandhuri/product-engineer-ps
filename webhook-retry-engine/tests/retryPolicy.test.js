const { isRetryable, computeBackoffMs } = require('../src/scheduler/retryPolicy');
const { step, result } = require('./testLogger');

describe('retryPolicy: isRetryable classification', () => {
  test('classifies 5xx responses as retryable', () => {
    step('Checking 503 and 500 responses');
    const res503 = isRetryable(503, false);
    const res500 = isRetryable(500, false);
    result(`503 → retryable: ${res503}`, res503 === true);
    result(`500 → retryable: ${res500}`, res500 === true);
    expect(res503).toBe(true);
    expect(res500).toBe(true);
  });

  test('classifies 429 (rate limited) and 408 (timeout) as retryable', () => {
    step('Checking 429 and 408 responses');
    const res429 = isRetryable(429, false);
    const res408 = isRetryable(408, false);
    result(`429 → retryable: ${res429}`, res429 === true);
    result(`408 → retryable: ${res408}`, res408 === true);
    expect(res429).toBe(true);
    expect(res408).toBe(true);
  });

  test('classifies a network error as retryable regardless of status', () => {
    step('Checking a network-level error (no HTTP status received)');
    const res = isRetryable(undefined, true);
    result(`network error → retryable: ${res}`, res === true);
    expect(res).toBe(true);
  });

  test('classifies other 4xx responses as terminal (not retryable)', () => {
    step('Checking 400, 404, 422 responses');
    const res400 = isRetryable(400, false);
    const res404 = isRetryable(404, false);
    const res422 = isRetryable(422, false);
    result(`400 → retryable: ${res400} (expected false)`, res400 === false);
    result(`404 → retryable: ${res404} (expected false)`, res404 === false);
    result(`422 → retryable: ${res422} (expected false)`, res422 === false);
    expect(res400).toBe(false);
    expect(res404).toBe(false);
    expect(res422).toBe(false);
  });
});

describe('retryPolicy: computeBackoffMs', () => {
  test('doubles the delay with each attempt number', () => {
    step('Computing backoff for attempts 1, 2, 3');
    const d1 = computeBackoffMs(1, 1000, 30000);
    const d2 = computeBackoffMs(2, 1000, 30000);
    const d3 = computeBackoffMs(3, 1000, 30000);
    result(`attempt 1 → ${d1}ms (expected 1000)`, d1 === 1000);
    result(`attempt 2 → ${d2}ms (expected 2000)`, d2 === 2000);
    result(`attempt 3 → ${d3}ms (expected 4000)`, d3 === 4000);
    expect(d1).toBe(1000);
    expect(d2).toBe(2000);
    expect(d3).toBe(4000);
  });

  test('caps the delay at maxMs on high attempt numbers', () => {
    step('Computing backoff for attempt 10 with a 30000ms cap');
    const d = computeBackoffMs(10, 1000, 30000);
    result(`attempt 10 → ${d}ms (expected capped at 30000)`, d === 30000);
    expect(d).toBe(30000);
  });
});