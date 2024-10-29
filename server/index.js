const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { handleMessage } = require('./messageHandler');
const dotenv = require('dotenv');
const { sendWhatsAppMessage } = require('./services/twilioService');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  const email = req.headers['x-forwarded-user'];
  const allowedEmails = process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(',') : [];
  const allowedDomains = process.env.ALLOWED_DOMAINS ? process.env.ALLOWED_DOMAINS.split(',') : [];

  if (!email) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAllowedEmail = allowedEmails.includes(email);
  const isAllowedDomain = allowedDomains.some(domain => email.endsWith(`@${domain}`));

  if (!isAllowedEmail && !isAllowedDomain) {
    return res.status(403).json({ error: 'Access denied' });
  }

  next();
};

// Apply authentication check to all routes
app.use(checkAuth);

app.post('/webhook', async (req, res) => {
  const twiml = new MessagingResponse();
  const incomingMsg = req.body.Body;
  const mediaUrl = req.body.MediaUrl0;

  try {
    const response = await handleMessage(incomingMsg, mediaUrl);
    twiml.message(response);
  } catch (error) {
    console.error('Error processing message:', error);
    twiml.message('Sorry, there was an error processing your request.');
  }

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
});

app.get('/', (req, res) => {
  res.send('WhatsApp AI Assistant is running!');
});

app.post('/api/send-whatsapp', async (req, res) => {
  const { to, body } = req.body;
  try {
    const message = await sendWhatsAppMessage(to, body);
    res.json({ success: true, messageSid: message.sid });
  } catch (error) {
    console.error('Error in /api/send-whatsapp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { to, body } = req.body;
    const message = await sendWhatsAppMessage(to, body);
    res.json({ success: true, messageSid: message.sid });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
