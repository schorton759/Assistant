const OpenAI = require('openai');
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function createChatCompletion(messages, options = {}) {
  try {
    logger.info('Attempting OpenAI API call with key:', process.env.OPENAI_API_KEY.slice(-4));
    
    const response = await openai.chat.completions.create({
      model: options.model || 'gpt-4',
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 1000,
    });

    return response;
  } catch (error) {
    // Log specific error details
    logger.error('OpenAI API Error:', {
      error: error.message,
      type: error.type,
      status: error.status,
      code: error.code
    });

    // Check for specific error types
    if (error.code === 'invalid_api_key') {
      throw new Error('Invalid OpenAI API key. Please check your configuration.');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded.');
    } else if (error.code === 'rate_limit_exceeded') {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    }

    throw error;
  }
}

module.exports = {
  openai,
  createChatCompletion
};
