//Uses Round-Robin to select events:
function selectBatch(dueEvents, batchSize) {
  const byClient = new Map();
  for (const event of dueEvents) {
    const key = event.clientId ?? 'unknown';
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key).push(event);
  }

  const selected = [];
  let progressMadeThisPass = true;

  while (selected.length < batchSize && progressMadeThisPass) {
    progressMadeThisPass = false;
    for (const events of byClient.values()) {
      if (selected.length >= batchSize) break;
      if (events.length > 0) {
        selected.push(events.shift());
        progressMadeThisPass = true;
      }
    }
  }

  return selected;
}

module.exports = { selectBatch };