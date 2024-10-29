const axios = require('axios');
const moment = require('moment-timezone');

async function getSerperResults(query) {
  try {
    const response = await axios.post('https://google.serper.dev/search', {
      q: query
    }, {
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    return response.data.organic.slice(0, 3); // Return top 3 results
  } catch (error) {
    console.error('Error fetching Serper results:', error);
    return [];
  }
}

async function getWeather(location) {
  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
      params: {
        q: location,
        appid: process.env.OPENWEATHER_API_KEY,
        units: 'metric'
      }
    });
    const data = response.data;
    return `Weather in ${data.name}: ${data.weather[0].description}, Temperature: ${data.main.temp}°C, Humidity: ${data.main.humidity}%`;
  } catch (error) {
    console.error('Error fetching weather:', error);
    return `Unable to fetch weather information for ${location} at this time.`;
  }
}

async function getStockMarketSummary() {
  try {
    const response = await axios.get(`https://www.alphavantage.co/query`, {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol: 'SPY',  // S&P 500 ETF as a proxy for overall market
        apikey: process.env.ALPHA_VANTAGE_API_KEY
      }
    });
    const data = response.data['Global Quote'];
    return `S&P 500 (SPY) summary: Price: $${parseFloat(data['05. price']).toFixed(2)}, Change: ${data['09. change']} (${data['10. change percent']})`;
  } catch (error) {
    console.error('Error fetching stock market data:', error);
    return 'Unable to fetch stock market data at this time.';
  }
}

async function getNewsSummary() {
  try {
    const response = await axios.get(`https://newsapi.org/v2/top-headlines`, {
      params: {
        country: 'us',
        apiKey: process.env.NEWS_API_KEY
      }
    });
    const articles = response.data.articles.slice(0, 3);
    return articles.map(article => `${article.title} - ${article.description}`).join('\n\n');
  } catch (error) {
    console.error('Error fetching news:', error);
    return 'Unable to fetch news summary at this time.';
  }
}

module.exports = {
  getSerperResults,
  getWeather,
  getStockMarketSummary,
  getNewsSummary,
};
