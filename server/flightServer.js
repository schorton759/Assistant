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

app.get('/', (_req, res) => {
  res.json({
    name: 'SkyAgent',
    message: 'AI travel desk API',
    endpoints: ['/api/flights/health', '/api/flights/search', '/api/flights/ask'],
  });
});

app.use('/api/flights', flightRoutes);

// Serve Expo web / static preview if present
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(port, () => {
  console.log(`SkyAgent flight API on http://localhost:${port}`);
  console.log(`NVIDIA enabled: ${Boolean(process.env.NVIDIA_API_KEY)}`);
});
