const { OpenAI } = require("openai");
const { getSerperResults, getWeather, getStockMarketSummary, getNewsSummary } = require('./services/additionalServices');
const { uploadFile, getDropboxLink } = require('./services/dropboxService');
const Alert = require('./models/Alert');  // Changed from '../models/Alert'
const { generateResponse } = require('./services/aiService');
const { sendWhatsAppMessage } = require('./services/twilioService');
const logger = require('./utils/logger');
const { generateAndUploadPresentation } = require('./services/presentationService');
const { classifyIntent } = require('./intentClassification');
const User = require('./models/User');  // Changed from '../models/User'
const { getNewsUpdate, getMarketUpdate, getWeatherUpdate } = require('./services/updateService');
const { createAlert, getAlerts, updateAlert, deleteAlert } = require('./controllers/alertController');
const isOffline = process.env.OFFLINE_MODE === 'true';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Simple in-memory store for conversation history
const userContexts = new Map();

const alertCreationSteps = {
  service: 'What service would you like to set an alert for? Options include: News Summary, Weather Forecast, Stock Update, or Custom Reminder.',
  time: 'At what time would you like to receive this alert? (e.g., 09:00)',
  frequency: 'How often should this alert be sent? Options are: Daily, Weekly, or One-off.',
  message: 'Please enter a custom message for your alert (or type "skip" if not applicable).',
  confirmation: 'Your alert has been set. Is there anything else I can help you with?'
};

const alertCreationState = new Map();

async function handleMessage(message, fileInfo, phoneNumber, country = '') {
  try {
    // Clean up phone number format
    phoneNumber = phoneNumber.replace('whatsapp:', '').trim();

    // Find or create user
    let user = await User.findOne({ phoneNumber });
    
    // If new user and not registering, prompt for registration
    if (!user && !message.toLowerCase().includes('register')) {
      return "Welcome! Please send 'register' to start using our services.";
    }

    // Update last interaction
    if (user) {
      user.lastInteraction = new Date();
      await user.save();
    }

    // Handle registration command
    if (message.toLowerCase().includes('register')) {
      return await handleRegistration(message, phoneNumber);
    }

    // Process the message
    const intent = await classifyIntent(message);
    logger.info(`Classified intent: ${intent}`);

    // Generate response based on intent
    const response = await generateResponse(message);
    
    return response;
  } catch (error) {
    logger.error('Error in handleMessage:', error);
    return "I'm sorry, but I encountered an error. Please try again later.";
  }
}

function extractLocation(message) {
  // Simple location extraction - could be made more sophisticated
  const words = message.toLowerCase().split(' ');
  const weatherIndex = words.indexOf('weather');
  if (weatherIndex !== -1 && weatherIndex < words.length - 1) {
    return words.slice(weatherIndex + 1).join(' ').replace(/[?.,!]/g, '');
  }
  return null;
}

function formatSearchResults(results) {
  if (!results || results.length === 0) {
    return "I couldn't find any relevant information.";
  }

  return results.map((result, index) => 
    `${index + 1}. ${result.title}\n${result.snippet}\n${result.link}`
  ).join('\n\n');
}

function determineAction(message) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('upload') && lowerMessage.includes('file')) {
    return 'upload';
  } else if (lowerMessage.includes('search') || lowerMessage.includes('look up')) {
    return 'search';
  }
  return 'none';
}

async function executeAction(action, fileInfo) {
  switch (action) {
    case 'upload':
      if (fileInfo && fileInfo.buffer) {
        try {
          console.log('Attempting to upload file:', fileInfo.originalname);
          const uploadResult = await uploadFile(fileInfo);
          console.log('Upload result:', uploadResult);
          const shareableLink = await getDropboxLink(uploadResult.result.path_display);
          return `File uploaded successfully. You can access it here: ${shareableLink}`;
        } catch (error) {
          console.error('Error uploading file:', error);
          return "There was an error uploading the file. Please try again.";
        }
      }
      return "No file was provided for upload.";
    case 'search':
      // We'll handle this in the generateResponse function
      return null;
    default:
      return null;
  }
}

async function handleAlertCreation(phoneNumber) {
  let state = alertCreationState.get(phoneNumber) || { step: 'service' };
  
  const response = alertCreationSteps[state.step];
  
  if (state.step === 'confirmation') {
    alertCreationState.delete(phoneNumber);
    return response;
  }
  
  state.step = getNextStep(state.step);
  alertCreationState.set(phoneNumber, state);
  
  return response;
}

function getNextStep(currentStep) {
  const steps = Object.keys(alertCreationSteps);
  const currentIndex = steps.indexOf(currentStep);
  return steps[currentIndex + 1];
}

async function processAlertCreation(message, phoneNumber) {
  let state = alertCreationState.get(phoneNumber);
  
  if (!state) return null;
  
  switch (state.step) {
    case 'service':
      state.service = message;
      break;
    case 'time':
      state.time = message;
      break;
    case 'frequency':
      state.frequency = message;
      break;
    case 'message':
      state.message = message === 'skip' ? '' : message;
      // Create and save the alert
      try {
        const newAlert = new Alert({...state, phoneNumber});
        await newAlert.save();
        logger.info(`New alert created for ${phoneNumber}: ${JSON.stringify(newAlert)}`);
      } catch (error) {
        logger.error(`Error saving alert for ${phoneNumber}:`, error);
      }
      break;
  }
  
  return handleAlertCreation(phoneNumber);
}

async function handleRegistration(message, phoneNumber) {
  try {
    // Add validation for phoneNumber
    if (!phoneNumber) {
      return "Invalid phone number. Please try again.";
    }

    // Check if user exists
    let user = await User.findOne({ phoneNumber });

    if (user) {
      return "You're already registered! Send 'help' to see available commands.";
    }

    // Create new user
    user = new User({
      phoneNumber,
      lastInteraction: new Date()
    });
    await user.save();

    return `Welcome to WhatsApp AI Assistant! 🎉\n\n` +
           `You can now use all our features:\n` +
           `• Set alerts for news, weather, and more\n` +
           `• Get instant information\n` +
           `• Create presentations\n` +
           `• Store and manage files\n\n` +
           `Send 'help' to see all available commands.`;
  } catch (error) {
    logger.error('Registration error:', error);
    return "Sorry, there was an error during registration. Please try again later.";
  }
}

module.exports = { handleMessage, processAlertCreation };
