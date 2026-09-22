const db = require('../src/db/connection');
const eventRepository = require('../src/repositories/eventRepository');
const attemptRepository = require('../src/repositories/attemptRepository');
const { tick } = require('../src/scheduler/scheduler');
const { step, result } = require('./testLogger');

beforeEach(() => {
  db.exec('DELETE FROM attempts; DELETE FROM events;');
  global.fetch = jest.fn();
});

function insertTestEvent(eventId, clientId = 'client-a') {
  return eventRepository.insertEvent({
    eventId,
    type: 'incident.created',
    occurredAt: new Date().toISOString(),
    payload: { incidentId: 'inc_1', severity: 'high' },
    clientId,
  }).event;
}

function mockResponse(status) {
  return { status };
}

function forceDueNow(eventId) {
  db.prepare(`UPDATE events SET next_attempt_at = ? WHERE event_id = ?`)
    .run(new Date(Date.now() - 1000).toISOString(), eventId);
}

describe('Scheduler — delivery and retry behavior', () => {
  test('AC1: a successful delivery marks the event delivered with one recorded attempt', async () => {
    step('Mocking receiver to return 200 on the first call');
    global.fetch.mockResolvedValueOnce(mockResponse(200));
    insertTestEvent('evt_success');

    step('Running one scheduler tick');
    await tick();

    const event = eventRepository.findByEventId('evt_success');
    const attempts = attemptRepository.findAttemptsByEventId('evt_success');
    step(`Event status=${event.status}, attemptCount=${event.attemptCount}, attempts recorded=${attempts.length}`);

    result('event status is delivered', event.status === 'delivered');
    result('exactly 1 attempt recorded', attempts.length === 1);
    result('recorded attempt outcome is success', attempts[0]?.outcome === 'success');

    expect(event.status).toBe('delivered');
    expect(event.attemptCount).toBe(1);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe('success');
  });

  test('AC2: a temporary failure is retried and eventually succeeds', async () => {
    step('Mocking receiver: 503 on first call, 200 on second call');
    global.fetch
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(200));

    insertTestEvent('evt_retry');

    step('Running tick #1 (expect failure, retry scheduled)');
    await tick();
    let event = eventRepository.findByEventId('evt_retry');
    step(`After tick #1: status=${event.status}, attemptCount=${event.attemptCount}`);
    result('event is still pending (scheduled for retry)', event.status === 'pending');
    result('one failed attempt recorded so far', event.attemptCount === 1);

    step('Forcing the retry to be due now (skipping real backoff wait), running tick #2');
    forceDueNow('evt_retry');
    await tick();
    event = eventRepository.findByEventId('evt_retry');
    const attempts = attemptRepository.findAttemptsByEventId('evt_retry');
    step(`After tick #2: status=${event.status}, attemptCount=${event.attemptCount}, outcomes=[${attempts.map(a => a.outcome).join(', ')}]`);

    result('event is now delivered', event.status === 'delivered');
    result('attempt history shows failed_retryable then success, in order', JSON.stringify(attempts.map(a => a.outcome)) === JSON.stringify(['failed_retryable', 'success']));

    expect(event.status).toBe('delivered');
    expect(event.attemptCount).toBe(2);
    expect(attempts.map(a => a.outcome)).toEqual(['failed_retryable', 'success']);
  });

  test('AC3 (terminal): a non-retryable failure stops immediately without consuming further attempts', async () => {
    step('Mocking receiver to return 400 (terminal, not retryable)');
    global.fetch.mockResolvedValueOnce(mockResponse(400));
    insertTestEvent('evt_terminal');

    step('Running one scheduler tick');
    await tick();

    const event = eventRepository.findByEventId('evt_terminal');
    step(`Event status=${event.status}, attemptCount=${event.attemptCount}`);

    result('event stopped as failed after just 1 attempt', event.status === 'failed' && event.attemptCount === 1);

    expect(event.status).toBe('failed');
    expect(event.attemptCount).toBe(1);
  });

  test('AC3 (exhaustion): stops retrying once MAX_ATTEMPTS is reached, and never processes it again', async () => {
    step('Mocking receiver to return 503 on every call (MAX_ATTEMPTS=3 per test config)');
    global.fetch
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(503));

    insertTestEvent('evt_exhausted');

    step('Running tick #1');
    await tick();
    forceDueNow('evt_exhausted');

    step('Running tick #2');
    await tick();
    forceDueNow('evt_exhausted');

    step('Running tick #3 (this should hit MAX_ATTEMPTS and stop)');
    await tick();

    const event = eventRepository.findByEventId('evt_exhausted');
    const attempts = attemptRepository.findAttemptsByEventId('evt_exhausted');
    step(`After 3 ticks: status=${event.status}, attemptCount=${event.attemptCount}, total attempts recorded=${attempts.length}`);

    result('event is terminally failed after exhausting attempts', event.status === 'failed');
    result('exactly 3 attempts were recorded, no more', attempts.length === 3);

    expect(event.status).toBe('failed');
    expect(event.attemptCount).toBe(3);
    expect(attempts).toHaveLength(3);

    step('Running one more tick — should NOT call fetch again, since the event is no longer pending');
    global.fetch.mockClear();
    await tick();
    const fetchCallCount = global.fetch.mock.calls.length;
    step(`fetch was called ${fetchCallCount} times on this extra tick (expected 0)`);

    result('scheduler did not attempt the exhausted event again', fetchCallCount === 0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});