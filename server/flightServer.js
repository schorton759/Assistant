/**
 * Lightweight SkyAgent flight API — no Mongo/Twilio required.
 * Use: SKIP_MONGODB=true NODE_ENV=development node server/flightServer.js
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const flightRoutes = require('./routes/flightRoutes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, '..', 'public');

app.use('/api/flights', flightRoutes);

// Mobile Safari / PWA UI
function sendSkyAgent(_req, res) {
  res.sendFile(path.join(publicDir, 'skyagent', 'index.html'));
}

app.get('/', sendSkyAgent);
app.get(['/skyagent', '/skyagent/'], sendSkyAgent);

app.use(express.static(publicDir));

app.get('/api', (_req, res) => {
  res.json({
    name: 'SkyAgent',
    message: 'AI travel desk API',
    ui: '/skyagent/',
    endpoints: ['/api/flights/health', '/api/flights/search', '/api/flights/ask'],
  });
});

app.listen(port, () => {
  console.log(`SkyAgent web + API on http://localhost:${port}`);
  console.log(`Mobile UI: http://localhost:${port}/skyagent/`);
  console.log(`NVIDIA enabled: ${Boolean(process.env.NVIDIA_API_KEY)}`);
});
