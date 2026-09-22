
function isRetryable(httpStatus, wasNetworkError) {
  if (wasNetworkError) return true;
  if (httpStatus === 429) return true;
  if (httpStatus === 408) return true;
  if (httpStatus >= 500) return true;
  return false;
}

function computeBackoffMs(attemptNumber, baseMs = 1000, maxMs = 30000) {
  const delay = baseMs * Math.pow(2, attemptNumber - 1);
  return Math.min(delay, maxMs);
}

module.exports = { isRetryable, computeBackoffMs };