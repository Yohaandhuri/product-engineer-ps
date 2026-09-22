const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db/connection');
const { step, result } = require('./testLogger');

beforeEach(() => {
  db.exec('DELETE FROM attempts; DELETE FROM events;');
});

function sampleEvent(overrides = {}) {
  return {
    eventId: 'evt_default',
    type: 'incident.created',
    occurredAt: new Date().toISOString(),
    payload: { incidentId: 'inc_1', severity: 'high' },
    ...overrides,
  };
}

describe('POST /events — ingestion', () => {
  test('AC1-support: ingests a brand-new event and returns 201', async () => {
    step('Submitting a new event with eventId=evt_new');
    const res = await request(app).post('/events').send(sampleEvent({ eventId: 'evt_new' }));
    step(`Response: status=${res.status}, body.status=${res.body.status}, duplicate=${res.body.duplicate}`);

    result('HTTP 201 returned', res.status === 201);
    result('event marked as not a duplicate', res.body.duplicate === false);
    result('event status is pending', res.body.status === 'pending');

    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.status).toBe('pending');
  });

  test('rejects a request missing the required eventId field', async () => {
    step('Submitting an event with no eventId');
    const { eventId, ...invalidBody } = sampleEvent({ eventId: 'evt_missing_test' });
    const res = await request(app).post('/events').send(invalidBody);
    step(`Response: status=${res.status}`);

    result('HTTP 400 returned for invalid payload', res.status === 400);
    expect(res.status).toBe(400);
  });

  test('AC4: a repeated sequential submission is treated as a duplicate, not stored twice', async () => {
    const event = sampleEvent({ eventId: 'evt_sequential_dup' });

    step(`Submitting ${event.eventId} for the first time`);
    const first = await request(app).post('/events').send(event);
    step(`First submission: status=${first.status}, duplicate=${first.body.duplicate}`);

    step(`Submitting the exact same eventId (${event.eventId}) a second time`);
    const second = await request(app).post('/events').send(event);
    step(`Second submission: status=${second.status}, duplicate=${second.body.duplicate}`);

    const row = db.prepare('SELECT COUNT(*) as count FROM events WHERE event_id = ?').get(event.eventId);
    step(`Rows in database for this eventId: ${row.count}`);

    result('first submission created (201)', first.status === 201);
    result('second submission recognized as duplicate (200)', second.status === 200 && second.body.duplicate === true);
    result('only one row exists in the database', row.count === 1);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(row.count).toBe(1);
  });

  test('AC4: concurrent duplicate submissions still result in exactly one stored event', async () => {
    const event = sampleEvent({ eventId: 'evt_concurrent_dup' });

    step(`Firing two identical requests for ${event.eventId} at the same time`);
    const [res1, res2] = await Promise.all([
      request(app).post('/events').send(event),
      request(app).post('/events').send(event),
    ]);
    step(`Response 1: status=${res1.status} | Response 2: status=${res2.status}`);

    const statuses = [res1.status, res2.status].sort();
    const row = db.prepare('SELECT COUNT(*) as count FROM events WHERE event_id = ?').get(event.eventId);
    step(`Rows in database for this eventId: ${row.count}`);

    result('exactly one request created it (201), the other found it existing (200)', JSON.stringify(statuses) === JSON.stringify([200, 201]));
    result('only one row exists despite concurrent requests', row.count === 1);

    expect(statuses).toEqual([200, 201]);
    expect(row.count).toBe(1);
  });
});