const express = require('express');
const router = express.Router();
const { createChatCompletion } = require('../services/openai');
const logger = require('../utils/logger');

router.get('/test-openai', async (req, res) => {
  try {
    const response = await createChatCompletion([
      { role: 'user', content: 'Say "Hello, World!"' }
    ]);
    
    res.json({ 
      success: true, 
      message: response.choices[0].message.content 
    });
  } catch (error) {
    logger.error('OpenAI test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

module.exports = router;
