const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require("openai");
const logger = require('./utils/logger'); // Implied import for logger

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let pinecone;

async function initPinecone() {
  if (!pinecone) {
    try {
      pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });
    } catch (error) {
      console.error('Error initializing Pinecone:', error);
      pinecone = null;
    }
  }
  return pinecone;
}

async function getEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    // Truncate the embedding to 1024 dimensions
    return response.data[0].embedding.slice(0, 1024);
  } catch (error) {
    console.error('Error getting embedding:', error);
    return null;
  }
}

async function storeVector(text, metadata = {}) {
  try {
    const pinecone = await initPinecone();
    if (!pinecone) {
      logger.error('Failed to initialize Pinecone');
      return null;
    }
    
    const embedding = await getEmbedding(text);
    if (!embedding) {
      logger.error('Failed to get embedding');
      return null;
    }
    
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    const id = Date.now().toString();
    
    await index.upsert([{
      id,
      values: embedding,
      metadata: { ...metadata, text }
    }]);
    
    return id;
  } catch (error) {
    logger.error('Error storing vector:', error);
    return null;
  }
}

async function searchVectors(query, topK = 5) {
  const pinecone = await initPinecone();
  if (!pinecone) return [];
  
  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding) return [];
    
    const searchResponse = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true
    });
    
    return searchResponse.matches.map(match => ({
      id: match.id,
      score: match.score,
      text: match.metadata.text
    }));
  } catch (error) {
    console.error('Error searching vectors:', error);
    return [];
  }
}

module.exports = { storeVector, searchVectors };
