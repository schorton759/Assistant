const { OpenAI } = require("openai");
const logger = require('./utils/logger');

// Initialize OpenAI with the correct key format
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

async function classifyIntent(message) {
  const prompt = `
      Analyze the following message and determine the user's intent. 
      Classify into one of these categories:
      - weather: Weather-related queries
      - stocks: Stock market or financial queries
      - news: News-related requests
      - presentation: Requests to create presentations
      - alert: Alert creation or management
      - search: General search queries
      - dropbox: File storage related requests
      - chat: General conversation
      
      Message: "${message}"
      
      Respond with only the intent category.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 20,
    });

    const intent = response.choices[0].message.content.trim().toLowerCase();
    logger.info(`Classified intent for message "${message}": ${intent}`);
    return intent;
  } catch (error) {
    logger.error('Error classifying intent:', error);
    return "chat"; // Default to chat if classification fails
  }
}

function extractLocation(message) {
  // Simple location extraction for weather queries
  const words = message.toLowerCase().split(' ');
  const weatherIndex = words.indexOf('weather');
  if (weatherIndex !== -1 && weatherIndex < words.length - 1) {
    return words.slice(weatherIndex + 1).join(' ').replace(/[?.,!]/g, '');
  }
  return null;
}

function extractStockSymbol(message) {
  // Simple stock symbol extraction
  const words = message.toLowerCase().split(' ');
  const stockIndex = Math.max(words.indexOf('stock'), words.indexOf('stocks'));
  if (stockIndex !== -1 && stockIndex < words.length - 1) {
    return words[stockIndex + 1].toUpperCase();
  }
  return null;
}

function extractPresentationTopic(message) {
  // Extract presentation topic from message
  const match = message.match(/presentation (?:about|on) (.*)/i);
  return match ? match[1].trim() : null;
}

module.exports = { 
  classifyIntent,
  extractLocation,
  extractStockSymbol,
  extractPresentationTopic
};
