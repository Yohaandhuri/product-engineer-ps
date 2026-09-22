const { selectBatch } = require('../src/scheduler/selectBatch');
const { step, result } = require('./testLogger');

test('interleaves clients round-robin and stops exactly at batchSize', () => {
  step('3 clients: A has 3 events, B has 2, C has 1 — batchSize = 5');
  const dueEvents = [
    { eventId: 'e1', clientId: 'A' }, { eventId: 'e2', clientId: 'A' }, { eventId: 'e3', clientId: 'A' },
    { eventId: 'e4', clientId: 'B' }, { eventId: 'e5', clientId: 'B' },
    { eventId: 'e6', clientId: 'C' },
  ];

  const batch = selectBatch(dueEvents, 5);
  const order = batch.map(e => e.clientId);
  step(`Selected order: [${order.join(', ')}]`);

  const matches = JSON.stringify(order) === JSON.stringify(['A', 'B', 'C', 'A', 'B']);
  result(`Round-robin order correct: ${matches}`, matches);
  expect(order).toEqual(['A', 'B', 'C', 'A', 'B']);
});

test('a high-volume client does not starve a low-volume one', () => {
  step('clientA has 50 due events, clientB has 2 — batchSize = 20');
  const dueEvents = [
    ...Array.from({ length: 50 }, (_, i) => ({ eventId: `a${i}`, clientId: 'clientA' })),
    { eventId: 'b1', clientId: 'clientB' },
    { eventId: 'b2', clientId: 'clientB' },
  ];

  const batch = selectBatch(dueEvents, 20);
  const clientBCount = batch.filter(e => e.clientId === 'clientB').length;
  step(`clientB events included in batch: ${clientBCount} (expected 2)`);

  result('clientB was not starved', clientBCount === 2);
  expect(clientBCount).toBe(2);
});

test('returns everything without hanging when total events are fewer than batchSize', () => {
  step('Only 2 events total, batchSize = 20');
  const dueEvents = [{ eventId: 'e1', clientId: 'A' }, { eventId: 'e2', clientId: 'B' }];
  const batch = selectBatch(dueEvents, 20);
  step(`Returned ${batch.length} events (expected 2, no infinite loop)`);

  result('Did not hang, returned all available events', batch.length === 2);
  expect(batch).toHaveLength(2);
});