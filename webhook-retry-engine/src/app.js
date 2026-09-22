const express = require('express');
const eventsRoutes = require('./routes/eventsRoutes');

const app = express();
app.use(express.json());
app.use('/', eventsRoutes);

module.exports = app;