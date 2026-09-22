const eventRepository = require('../repositories/eventRepository');
const deliveryService = require('../services/deliveryService');
const { selectBatch } = require('./selectBatch');
const { computeBackoffMs } = require('./retryPolicy');
const { log } = require('../utils/logger');

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 1000;
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS) || 5;
const BACKOFF_BASE_MS = Number(process.env.BACKOFF_BASE_MS) || 1000;
const BACKOFF_MAX_MS = Number(process.env.BACKOFF_MAX_MS) || 30000;
const PER_CLIENT_FETCH_LIMIT = Number(process.env.PER_CLIENT_FETCH_LIMIT) || 5;
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS) || 50;
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 20;

async function processEvent(event) {
  const claimSucceeded = eventRepository.markDelivering(event.eventId);
  if (!claimSucceeded) {
    log('event_skipped_lost_race', { eventId: event.eventId });
    return;
  }

  log('event_processing_started', {
    eventId: event.eventId,
    clientId: event.clientId,
    attemptNumber: event.attemptCount + 1,
  });

  try {
    const result = await deliveryService.attemptDelivery(event);
    const nextAttemptNumber = event.attemptCount + 1;

    if (result.outcome === 'success') {
      eventRepository.markDelivered(event.eventId);
      log('event_processing_succeeded', {
        eventId: event.eventId,
        attemptNumber: nextAttemptNumber,
        httpStatus: result.httpStatus,
      });
      return;
    }

    if (result.outcome === 'failed_terminal') {
      eventRepository.markFailed(event.eventId);
      log('event_processing_stopped_terminal', {
        eventId: event.eventId,
        attemptNumber: nextAttemptNumber,
        httpStatus: result.httpStatus,
        reason: 'non-retryable response classification',
      });
      return;
    }

    if (nextAttemptNumber >= MAX_ATTEMPTS) {
      eventRepository.markFailed(event.eventId);
      log('event_processing_stopped_max_attempts', {
        eventId: event.eventId,
        attemptNumber: nextAttemptNumber,
        maxAttempts: MAX_ATTEMPTS,
      });
      return;
    }

    const delayMs = computeBackoffMs(nextAttemptNumber, BACKOFF_BASE_MS, BACKOFF_MAX_MS);
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    eventRepository.scheduleRetry(event.eventId, nextAttemptAt);
    log('event_processing_retry_scheduled', {
      eventId: event.eventId,
      attemptNumber: nextAttemptNumber,
      delayMs,
      nextAttemptAt,
    });

  } catch (err) {
    log('event_processing_unexpected_error', {
      eventId: event.eventId,
      error: err.message,
    });
    const nextAttemptTime = new Date().toISOString()
    eventRepository.scheduleRetry(event.eventId, nextAttemptTime);
    log('event_processing_retry_scheduled_after_error', {
      eventId: event.eventId,
      nextAttemptAt: nextAttemptTime,
    });
  }
}

async function tick() {
  const dueEvents = eventRepository.findDueEvents({
    perClientLimit: PER_CLIENT_FETCH_LIMIT,
    maxClients: MAX_CLIENTS,
  });

  const batch = selectBatch(dueEvents, BATCH_SIZE);

  if (batch.length === 0) return;

  log('scheduler_tick_processing', { batchSize: batch.length });

  await Promise.all(batch.map(event => processEvent(event)));

  log('scheduler_tick_completed', { batchSize: batch.length });
}

let intervalHandle = null;

function startScheduler() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    tick().catch(err => log('scheduler_tick_error', { error: err.message }));
  }, POLL_INTERVAL_MS);
  log('scheduler_started', { pollIntervalMs: POLL_INTERVAL_MS, maxAttempts: MAX_ATTEMPTS });
}

function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    log('scheduler_stopped', {});
  }
}

module.exports = { tick, startScheduler, stopScheduler };