const axios = require('axios');
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function analyzeText(text) {
  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant that analyzes text." },
        { role: "user", content: `Analyze the following text and provide a brief summary, key points, and sentiment: "${text}"` }
      ],
      max_tokens: 150
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error analyzing text:', error);
    throw error;
  }
}

async function analyzeImage(imagePath) {
  try {
    const response = await openai.createImageAnalysis({
      image: imagePath,
      model: "gpt-4-vision-preview",
      max_tokens: 300,
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw error;
  }
}

module.exports = { analyzeText, analyzeImage };