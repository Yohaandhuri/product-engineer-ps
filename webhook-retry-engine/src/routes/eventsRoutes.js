const express = require('express');
const { eventSchema } = require('../validation/eventSchema');
const ingestionService = require('../services/ingestionService');
const eventRepository = require('../repositories/eventRepository');
const attemptRepository = require('../repositories/attemptRepository');
const { log } = require('../utils/logger');

const router = express.Router();

router.post('/events', (req, res) => {
  const parseResult = eventSchema.safeParse(req.body);

  if (!parseResult.success) {
    log('ingestion_validation_failed', {
      errors: parseResult.error.issues,
    });
    return res.status(400).json({
      error: 'Invalid event payload',
      details: parseResult.error.issues,
    });
  }

  const eventData = parseResult.data;

  if (!eventData.clientId) {
    eventData.clientId = req.ip;
  }

  const { created, event } = ingestionService.ingest(eventData);

  res.status(created ? 201 : 200).json({
    eventId: event.eventId,
    status: event.status,
    attemptCount: event.attemptCount,
    createdAt: event.createdAt,
    duplicate: !created,
  });
});

router.get('/events/:eventId', (req, res) => {
  const event = eventRepository.findByEventId(req.params.eventId);

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const attempts = attemptRepository.findAttemptsByEventId(event.eventId);

  res.json({
    eventId: event.eventId,
    type: event.type,
    status: event.status,
    attemptCount: event.attemptCount,
    createdAt: event.createdAt,
    nextAttemptAt: event.status === 'pending' ? event.nextAttemptAt : null,
    attempts,
  });
});

router.get('/events', (req, res) => {
  const events = eventRepository.findAll();
  res.json(events);
});

module.exports = router;