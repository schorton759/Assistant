const { openai } = require('../services/openai');
const logger = require('../utils/logger');

async function verifyOpenAIConnection() {
  try {
    const models = await openai.models.list();
    logger.info('OpenAI connection verified successfully');
    return true;
  } catch (error) {
    logger.error('OpenAI connection verification failed:', error);
    return false;
  }
}

module.exports = verifyOpenAIConnection;
