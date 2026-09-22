const eventRepository = require('../repositories/eventRepository');
const { log } = require('../utils/logger');

function ingest({ eventId, type, occurredAt, payload, clientId }) {
  const result = eventRepository.insertEvent({ eventId, type, occurredAt, payload, clientId });

  log('ingestion_result', {
    eventId,
    clientId,
    created: result.created,
  });

  return result; 
}

module.exports = { ingest };