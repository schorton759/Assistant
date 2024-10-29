const cron = require('node-cron');
const Alert = require('../models/Alert');
const { sendWhatsAppMessage } = require('./twilioService');
const { getNewsUpdate, getMarketUpdate, getWeatherUpdate } = require('./updateService');
const logger = require('../utils/logger');
const { saveLocally, getLocally } = require('./localStorageService');

async function scheduleAlerts() {
  logger.info('Scheduling alerts...');
  
  // Schedule a task to run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const currentDay = now.getDay();

      // Try to get alerts from database, fallback to local storage if database is down
      let alerts;
      try {
        alerts = await Alert.find();
      } catch (error) {
        logger.error('Database error, falling back to local storage:', error);
        alerts = await getLocally('alerts') || [];
      }

      logger.info(`Checking ${alerts.length} alerts at ${currentTime}`);

      for (const alert of alerts) {
        if (shouldTriggerAlert(alert, currentTime, currentDay)) {
          await triggerAlert(alert);
        }
      }
    } catch (error) {
      logger.error('Error processing alerts:', error);
    }
  });

  logger.info('Alert scheduler started');
}

function shouldTriggerAlert(alert, currentTime, currentDay) {
  if (alert.time !== currentTime) return false;

  switch (alert.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      // Assuming Sunday is the day for weekly alerts
      return currentDay === 0;
    case 'one-off':
      return true;
    default:
      return false;
  }
}

async function triggerAlert(alert) {
  logger.info(`Triggering alert: ${alert.service}`);

  try {
    let message = '';
    switch (alert.service) {
      case 'news_summary':
        message = await generateResponse('Give me a news summary');
        break;
      case 'weather_forecast':
        message = 'What\'s the weather forecast?';
        break;
      case 'stock_update':
        message = 'Give me a stock market update';
        break;
      case 'custom_reminder':
        message = alert.message;
        break;
      default:
        message = 'Alert triggered';
    }

    logger.info(`Attempting to send WhatsApp message for alert: ${alert._id}`);
    await sendWhatsAppMessage(alert.phoneNumber, message); // Note: phoneNumber is not used in sendWhatsAppMessage anymore
    logger.info(`WhatsApp message sent successfully for alert: ${alert._id}`);

    // Update the alert status and content
    alert.status = 'completed';
    alert.lastTriggeredAt = new Date();
    alert.lastTriggeredContent = message;
    await alert.save();

    logger.info(`Alert updated: ${alert._id}`);

    if (alert.frequency === 'one-off') {
      await Alert.findByIdAndDelete(alert._id);
      logger.info(`One-off alert deleted: ${alert._id}`);
    }
  } catch (error) {
    logger.error(`Error triggering alert for service ${alert.service}:`, error);
  }
}

module.exports = { scheduleAlerts };
