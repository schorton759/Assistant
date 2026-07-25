const axios = require('axios');
const logger = require('../utils/logger');

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

/** Free NVIDIA NIM models used by SkyAgent specialists */
const MODELS = {
  // Fast intent parsing / structured extraction
  intent: process.env.NVIDIA_MODEL_INTENT || 'meta/llama-3.1-8b-instruct',
  // Price & duration specialists
  specialist: process.env.NVIDIA_MODEL_SPECIALIST || 'nvidia/llama-3.1-nemotron-nano-8b-v1',
  // Travel-agent synthesis / best-route judgment
  concierge: process.env.NVIDIA_MODEL_CONCIERGE || 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  // Legacy alias used elsewhere in the repo
  default: process.env.NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct',
};

const FALLBACK_MODELS = [
  'meta/llama-3.1-8b-instruct',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'meta/llama-3.3-70b-instruct',
];

function hasNvidiaKey() {
  return Boolean(process.env.NVIDIA_API_KEY);
}

function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function chatCompletion({
  model = MODELS.default,
  messages,
  temperature = 0.3,
  maxTokens = 800,
  timeout = 25000,
}) {
  if (!hasNvidiaKey()) {
    throw new Error('NVIDIA_API_KEY is not configured');
  }

  const modelsToTry = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
  let lastError;

  for (const candidate of modelsToTry) {
    try {
      const response = await axios.post(
        `${NVIDIA_BASE_URL}/chat/completions`,
        {
          model: candidate,
          messages,
          temperature,
          top_p: 0.9,
          max_tokens: maxTokens,
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout,
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from NVIDIA API');
      }

      return {
        content,
        model: candidate,
        usage: response.data?.usage || null,
      };
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      // Retry on model-not-found / unavailable
      if (status === 404 || status === 400) {
        logger.warn(`NVIDIA model unavailable (${candidate}), trying fallback…`);
        continue;
      }
      break;
    }
  }

  if (lastError?.code === 'ECONNABORTED') {
    throw new Error('NVIDIA API request timed out');
  }

  logger.error('Error generating response:', lastError?.response?.data || lastError?.message);
  throw new Error('Failed to generate response from NVIDIA API');
}

async function generateResponse(prompt) {
  try {
    const result = await chatCompletion({
      model: MODELS.default,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
      timeout: 15000,
    });
    return result.content;
  } catch (error) {
    if (error.message.includes('timed out') || error.message.includes('not configured')) {
      return "I'm sorry, but I'm having trouble connecting to my services right now. Please try again in a moment.";
    }
    throw error;
  }
}

async function generateJson({
  model,
  system,
  user,
  temperature = 0.2,
  maxTokens = 1000,
}) {
  const result = await chatCompletion({
    model,
    messages: [
      {
        role: 'system',
        content: `${system}\n\nRespond with valid JSON only. No markdown fences, no commentary.`,
      },
      { role: 'user', content: user },
    ],
    temperature,
    maxTokens,
  });

  const parsed = extractJson(result.content);
  if (!parsed) {
    throw new Error('NVIDIA response was not valid JSON');
  }

  return { data: parsed, model: result.model, raw: result.content };
}

module.exports = {
  MODELS,
  hasNvidiaKey,
  chatCompletion,
  generateResponse,
  generateJson,
  extractJson,
};
