require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { handleMessage, processAlertCreation } = require('./server/messageHandler');
const { sendWhatsAppMessage } = require('./server/services/twilioService');
const Alert = require('./server/models/Alert');  // Changed from './models/Alert'
const fs = require('fs').promises;
const winston = require('winston');
const { generateAndUploadPresentation } = require('./server/services/presentationService');
const { scheduleAlerts } = require('./server/services/schedulerService');
const alertController = require('./server/controllers/alertController');
const { classifyIntent } = require('./server/intentClassification');
const { storeVector, searchVectors } = require('./server/vectorStore');
const User = require('./server/models/User');  // Changed from './models/User'
const { OpenAI } = require("openai");
const axios = require('axios');
const twilio = require('twilio');
const { Dropbox } = require('dropbox');
const { initPinecone } = require('./server/vectorStore');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

const app = express();
const port = process.env.PORT || 3000;
const isTestMode = process.env.TEST_MODE === 'true';
const isDevEnvironment = process.env.NODE_ENV === 'development';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

mongoose.set('strictQuery', false);

// Add this near the top of your server.js
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// MongoDB connection with retry
async function connectToMongoDB() {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
      });
      logger.info('Connected to MongoDB');
      return;
    } catch (error) {
      retries++;
      logger.error(`MongoDB connection attempt ${retries} failed:`, error);
      if (retries === maxRetries) {
        logger.error('Max retries reached. Exiting...');
        process.exit(1);
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Call the connection function
connectToMongoDB();

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  if (isDevEnvironment) {
    // Bypass authentication for local development
    return next();
  }

  const email = req.headers['x-forwarded-user'];
  const allowedEmails = process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(',') : [];
  const allowedDomains = process.env.ALLOWED_DOMAINS ? process.env.ALLOWED_DOMAINS.split(',') : [];

  if (!email) {
    logger.warn('Authentication required');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAllowedEmail = allowedEmails.includes(email);
  const isAllowedDomain = allowedDomains.some(domain => email.endsWith(`@${domain}`));

  if (!isAllowedEmail && !isAllowedDomain) {
    logger.warn(`Access denied for email: ${email}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  logger.info(`Authenticated user: ${email}`);
  next();
};

// Apply authentication check to all routes
app.use(checkAuth);

// Add this near the top of your server.js file
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Serve static files from the public directory
app.use(express.static('public', { 
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store');
  }
}));

app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.Body;
    const from = req.body.From.replace('whatsapp:', '');
    
    logger.info(`Received WhatsApp message from ${from}: ${message}`);

    const response = await handleMessage(message, null, from);
    
    const twiml = new MessagingResponse();
    twiml.message(response);

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
  } catch (error) {
    logger.error('Error handling webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

app.get('/', (req, res) => {
  res.send('WhatsApp AI Assistant is running!');
});

app.post('/api/send-whatsapp', async (req, res) => {
  const { to, body } = req.body;
  try {
    if (isTestMode) {
      logger.info(`Test mode: Simulating WhatsApp message to ${to}: ${body}`);
      res.json({ success: true, messageSid: 'TEST_SID_' + Date.now() });
    } else {
      const message = await sendWhatsAppMessage(to, body);
      logger.info(`Sent WhatsApp message to ${to}: ${body}`);
      res.json({ success: true, messageSid: message.sid });
    }
  } catch (error) {
    logger.error('Error in /api/send-whatsapp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  const { to, body } = req.body;
  try {
    if (isTestMode) {
      logger.info(`Test mode: Simulating message to ${to}: ${body}`);
      res.json({ success: true, messageSid: 'TEST_SID_' + Date.now() });
    } else {
      const message = await sendWhatsAppMessage(to, body);
      logger.info(`Sent message to ${to}: ${body}`);
      res.json({ success: true, messageSid: message.sid });
    }
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET all alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await Alert.find().sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Alert routes
app.post('/api/alerts', alertController.createAlert);
app.get('/api/alerts/pending', alertController.getPendingAlerts);
app.get('/api/alerts/completed', alertController.getCompletedAlerts);
app.delete('/api/alerts/:id', alertController.deleteAlert);
app.put('/api/alerts/:id', alertController.updateAlert);

// Settings routes
app.get('/api/settings', async (req, res) => {
  try {
    const settingsPath = path.join(__dirname, 'settings.json');
    const settingsData = await fs.readFile(settingsPath, 'utf8');
    res.json(JSON.parse(settingsData));
  } catch (error) {
    console.error('Error reading settings:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settingsPath = path.join(__dirname, 'settings.json');
    await fs.writeFile(settingsPath, JSON.stringify(req.body, null, 2));
    res.json({ message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Chat endpoint with enhanced handling
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const phoneNumber = 'web_user';
    
    let intent = 'chat'; // Default intent
    try {
      intent = await classifyIntent(message);
      logger.info(`Classified intent: ${intent}`);
    } catch (error) {
      logger.error('Error classifying intent, using default:', error);
    }

    // Handle the message based on intent
    const response = await handleMessage(message, null, phoneNumber);
    
    // Try to store the interaction, but don't fail if it doesn't work
    try {
      await storeVector(message, { 
        intent,
        response,
        timestamp: new Date(),
        phoneNumber
      });
    } catch (error) {
      logger.error('Error storing vector:', error);
    }

    res.json({ content: response });
  } catch (error) {
    logger.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Presentation endpoint
app.post('/api/presentation', async (req, res) => {
  try {
    const { topic, format = 'pdf', slides = 5 } = req.body;
    const presentationLink = await generateAndUploadPresentation(topic, format, slides);
    res.json({ link: presentationLink });
  } catch (error) {
    logger.error('Presentation error:', error);
    res.status(500).json({ error: 'Failed to generate presentation' });
  }
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the alert scheduler
scheduleAlerts();

// Add this function to check all API connections
async function checkAPIConnections() {
  logger.info('Starting API connection checks...');

  // Check OpenAI API
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 5
    });
    if (response.choices && response.choices.length > 0) {
      logger.info('✓ OpenAI API connection successful');
    }
  } catch (error) {
    logger.error('✗ OpenAI API connection failed:', error.message);
  }

  // Check NVIDIA API
  try {
    const response = await axios.post(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        model: "nvidia/llama-3.1-nemotron-70b-instruct",
        messages: [{ role: "user", content: "test" }],
        max_tokens: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (response.data) {
      logger.info('✓ NVIDIA API connection successful');
    }
  } catch (error) {
    logger.error('✗ NVIDIA API connection failed:', error.message);
  }

  // Check Twilio API
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    if (account.status === 'active') {
      logger.info('✓ Twilio API connection successful');
    }
  } catch (error) {
    logger.error('✗ Twilio API connection failed:', error.message);
  }

  // Check MongoDB connection
  try {
    if (mongoose.connection.readyState === 1) {
      logger.info('✓ MongoDB connection successful');
    } else {
      logger.error('✗ MongoDB not connected');
    }
  } catch (error) {
    logger.error('✗ MongoDB connection failed:', error.message);
  }

  // Check Dropbox API
  try {
    const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
    const response = await dbx.usersGetCurrentAccount();
    if (response.result.email) {
      logger.info('✓ Dropbox API connection successful');
    }
  } catch (error) {
    logger.error('✗ Dropbox API connection failed:', error.message);
  }

  // Check Pinecone
  try {
    const pinecone = await initPinecone();
    if (pinecone) {
      const indexes = await pinecone.listIndexes();
      if (indexes) {
        logger.info('✓ Pinecone connection successful');
      }
    }
  } catch (error) {
    logger.error('✗ Pinecone connection failed:', error.message);
  }

  logger.info('API connection checks completed');
}

// Add this to your server startup
app.listen(port, async () => {
  logger.info('Server starting...');
  
  // Connect to MongoDB first
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
  }

  // Check all API connections
  await checkAPIConnections();

  // Start the alert scheduler
  scheduleAlerts();

  logger.info(`Server running on port ${port}`);
});

// Function to log to a file
async function logToFile(filename, message) {
  const logPath = path.join(__dirname, 'logs', filename);
  await fs.appendFile(logPath, `${new Date().toISOString()} - ${message}\n`);
}

app.get('/api/test', (req, res) => {
    console.log('Received test request');
    res.json({ message: 'Backend is working' });
});

// Add this near the top of the file
console.log('Server starting with updated code...');

// Profile routes
app.get('/api/profile', async (req, res) => {
    try {
        // For now, we'll just get the default user
        const user = await User.findOne({ phoneNumber: '+14415362022' });
        if (!user) {
            // Create default user if it doesn't exist
            const defaultUser = new User({
                phoneNumber: '+14415362022',
                preferences: {
                    timezone: 'UTC',
                    language: 'en',
                    notifications: true
                }
            });
            await defaultUser.save();
            return res.json(defaultUser);
        }
        res.json(user);
    } catch (error) {
        logger.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.post('/api/profile', async (req, res) => {
    try {
        const { name, phoneNumber, preferences } = req.body;
        const user = await User.findOneAndUpdate(
            { phoneNumber },
            { 
                $set: { 
                    name,
                    preferences
                }
            },
            { new: true, upsert: true }
        );
        res.json(user);
    } catch (error) {
        logger.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Remove or comment out this line:
// const testRoutes = require('./routes/testRoutes');
