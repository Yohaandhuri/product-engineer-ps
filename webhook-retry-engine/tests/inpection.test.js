const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/connection');
const eventRepository = require('../src/repositories/eventRepository');
const { tick } = require('../src/scheduler/scheduler');
const { step, result } = require('./testLogger');

beforeEach(() => {
  db.exec('DELETE FROM attempts; DELETE FROM events;');
  global.fetch = jest.fn();
});

function mockResponse(status) {
  return { status };
}

function forceDueNow(eventId) {
  db.prepare(`UPDATE events SET next_attempt_at = ? WHERE event_id = ?`)
    .run(new Date(Date.now() - 1000).toISOString(), eventId);
}

describe('GET /events/:eventId — AC5: inspectable history', () => {
  test('exposes current state and a correctly ordered attempt history after multiple attempts', async () => {
    step('Setting up an event that fails once, then succeeds');
    global.fetch
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(200));

    eventRepository.insertEvent({
      eventId: 'evt_inspect_1',
      type: 'incident.created',
      occurredAt: new Date().toISOString(),
      payload: { incidentId: 'inc_1', severity: 'high' },
      clientId: 'client-a',
    });

    step('Running tick #1 (fails)');
    await tick();
    forceDueNow('evt_inspect_1');
    step('Running tick #2 (succeeds)');
    await tick();

    step('Fetching GET /events/evt_inspect_1');
    const res = await request(app).get('/events/evt_inspect_1');
    step(`Response: status=${res.status}, eventStatus=${res.body.status}, attemptCount=${res.body.attemptCount}`);
    step(`Attempts returned: ${JSON.stringify(res.body.attempts.map(a => ({ n: a.attemptNumber, outcome: a.outcome })))}`);

    result('HTTP 200 returned', res.status === 200);
    result('current status is delivered', res.body.status === 'delivered');
    result('attemptCount is 2', res.body.attemptCount === 2);
    result('two attempts are present in the history', res.body.attempts.length === 2);
    result(
      'attempts are in correct order: failed_retryable then success',
      res.body.attempts[0]?.outcome === 'failed_retryable' && res.body.attempts[1]?.outcome === 'success'
    );
    result(
      'attempt numbers are ordered 1, then 2',
      res.body.attempts[0]?.attemptNumber === 1 && res.body.attempts[1]?.attemptNumber === 2
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('delivered');
    expect(res.body.attemptCount).toBe(2);
    expect(res.body.attempts).toHaveLength(2);
    expect(res.body.attempts.map(a => a.outcome)).toEqual(['failed_retryable', 'success']);
    expect(res.body.attempts.map(a => a.attemptNumber)).toEqual([1, 2]);
  });

  test('returns 404 for an eventId that does not exist', async () => {
    step('Fetching a non-existent eventId');
    const res = await request(app).get('/events/evt_does_not_exist');
    step(`Response: status=${res.status}, body=${JSON.stringify(res.body)}`);

    result('HTTP 404 returned', res.status === 404);
    expect(res.status).toBe(404);
  });
});