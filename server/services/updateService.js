const axios = require('axios');
const { NEWS_API_KEY, WEATHER_API_KEY, MARKET_API_KEY } = require('../config/apiKeys');

async function getNewsUpdate() {
  try {
    const response = await axios.get(`https://newsapi.org/v2/top-headlines?country=us&apiKey=${NEWS_API_KEY}`);
    const articles = response.data.articles.slice(0, 3);
    return `📰 Top News:\n\n${articles.map(article => `• ${article.title}`).join('\n\n')}`;
  } catch (error) {
    console.error('Error fetching news:', error);
    return 'Unable to fetch news at this time.';
  }
}

async function getMarketUpdate() {
  try {
    const response = await axios.get(`https://financialmodelingprep.com/api/v3/quote/AAPL,GOOGL,MSFT?apikey=${MARKET_API_KEY}`);
    const marketData = response.data.map(stock => `${stock.symbol}: $${stock.price.toFixed(2)} (${stock.changesPercentage.toFixed(2)}%)`).join('\n');
    return `📈 Market Update:\n\n${marketData}`;
  } catch (error) {
    console.error('Error fetching market data:', error);
    return 'Unable to fetch market data at this time.';
  }
}

async function getWeatherUpdate(location) {
  try {
    const response = await axios.get(`http://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${WEATHER_API_KEY}&units=metric`);
    const weather = response.data;
    return `🌤 Weather in ${weather.name}:\n${weather.weather[0].main}, Temperature: ${weather.main.temp.toFixed(1)}°C`;
  } catch (error) {
    console.error('Error fetching weather:', error);
    return 'Unable to fetch weather data at this time.';
  }
}

module.exports = { getNewsUpdate, getMarketUpdate, getWeatherUpdate };

