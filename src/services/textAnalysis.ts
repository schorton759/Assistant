import axios from 'axios';

const API_URL = 'https://api.openai.com/v1/chat/completions';

export async function analyzeText(text: string): Promise<string> {
  try {
    const response = await axios.post(
      API_URL,
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that analyzes text.' },
          { role: 'user', content: `Analyze the following text and provide a brief summary, key points, and sentiment: "${text}"` }
        ],
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error analyzing text:', error);
    throw error;
  }
}