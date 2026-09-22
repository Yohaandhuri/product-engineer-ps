require('dotenv').config();
const app = require('./app');
const { startScheduler } = require('./scheduler/scheduler');
require('./db/connection'); 

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Webhook retry engine listening on port ${PORT}`);
  startScheduler();  
});