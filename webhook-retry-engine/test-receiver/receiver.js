require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

let currentMode = 'success';
let failOnceHasFailed = false; 

app.post('/control/mode', (req, res) => {
  const { mode } = req.body;
  const validModes = ['success', 'fail_retryable', 'fail_terminal', 'fail_once', 'timeout'];

  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${validModes.join(', ')}` });
  }

  currentMode = mode;
  failOnceHasFailed = false;
  console.log(`[receiver] mode set to: ${mode}`);
  res.json({ mode: currentMode });
});

app.get('/control/mode', (req, res) => {
  res.json({ mode: currentMode });
});

app.post('/receive', (req, res) => {
  console.log(`[receiver] received event, current mode: ${currentMode}`, req.body?.eventId);

  switch (currentMode) {
    case 'success':
      return res.status(200).json({ received: true });

    case 'fail_retryable':
      return res.status(503).json({ error: 'Service temporarily unavailable' });

    case 'fail_terminal':
      return res.status(400).json({ error: 'Malformed request' });

    case 'fail_once':
      if (!failOnceHasFailed) {
        failOnceHasFailed = true;
        return res.status(503).json({ error: 'Temporary failure, try again' });
      }
      return res.status(200).json({ received: true });

    case 'timeout':
      return; // intentionally no response sent to mock timeout

    default:
      return res.status(200).json({ received: true });
  }
});

const PORT = process.env.RECEIVER_PORT || 4000;
app.listen(PORT, () => {
  console.log(`Test receiver listening on port ${PORT}, mode: ${currentMode}`);
});