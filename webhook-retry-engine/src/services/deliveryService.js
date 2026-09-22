const { isRetryable } = require('../scheduler/retryPolicy');
const attemptRepository = require('../repositories/attemptRepository');
const { log } = require('../utils/logger');

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS) || 5000;

async function attemptDelivery(event) {
  const attemptNumber = event.attemptCount + 1;
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let httpStatus = null;
  let errorMessage = null;
  let wasNetworkError = false;

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: event.eventId,
        type: event.type,
        occurredAt: event.occurredAt,
        payload: event.payload,
      }),
      signal: controller.signal,
    });
    httpStatus = response.status;
  } catch (err) {
    wasNetworkError = true;
    errorMessage = err.name === 'AbortError' ? 'Request timed out' : err.message;
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - startTime;
  const succeeded = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
  const retryable = !succeeded && isRetryable(httpStatus, wasNetworkError);

  const outcome = succeeded
    ? 'success'
    : retryable
      ? 'failed_retryable'
      : 'failed_terminal';

  attemptRepository.insertAttempt({
    eventId: event.eventId,
    attemptNumber,
    outcome,
    httpStatus,
    errorMessage,
    durationMs,
  });

  log('delivery_attempt_completed', {
    eventId: event.eventId,
    attemptNumber,
    outcome,
    httpStatus,
    durationMs,
  });

  return { outcome, httpStatus, errorMessage, durationMs };
}

module.exports = { attemptDelivery };