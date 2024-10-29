const axios = require('axios');
const logger = require('../utils/logger');

async function generateResponse(prompt) {
  try {
    const response = await axios.post(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        model: "nvidia/llama-3.1-nemotron-70b-instruct",
        messages: [{
          role: "user",
          content: prompt
        }],
        temperature: 0.5,
        top_p: 1,
        max_tokens: 500,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // Reduced to 10 seconds
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return "I'm sorry, but I'm having trouble connecting to my services right now. Please try again in a moment.";
    }
    logger.error('Error generating response:', error);
    throw new Error('Failed to generate response from NVIDIA API');
  }
}

module.exports = { generateResponse };
