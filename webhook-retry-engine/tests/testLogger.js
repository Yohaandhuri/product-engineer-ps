function step(message) {
  console.log(`========> ${message}`);
}

function result(label, passed) {
  console.log(`========> ${passed ? 'Passed' : 'Failed'} ${label}`);
}

module.exports = { step, result };