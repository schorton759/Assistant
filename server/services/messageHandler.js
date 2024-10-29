const User = require('../models/User');
const { getNewsUpdate, getMarketUpdate, getWeatherUpdate } = require('./updateService');
const { createAlert, getAlerts, updateAlert, deleteAlert } = require('../controllers/alertController');
const isOffline = process.env.OFFLINE_MODE === 'true';

async function handleMessage(message, phoneNumber) {
  if (isOffline) {
    return "I'm sorry, but I'm currently in offline mode and can't access all my features. I can still chat with you though!";
  }

  try {
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return "Sorry, I couldn't find your account. Please contact support.";
    }

    const lowerMessage = message.toLowerCase();

    if (lowerMessage.startsWith('create alert')) {
      return await handleCreateAlert(message, phoneNumber);
    } else if (lowerMessage === 'list alerts') {
      return await handleListAlerts(phoneNumber);
    } else if (lowerMessage.startsWith('update alert')) {
      return await handleUpdateAlert(message, phoneNumber);
    } else if (lowerMessage.startsWith('delete alert')) {
      return await handleDeleteAlert(message, phoneNumber);
    } else if (lowerMessage.includes('news')) {
      return await getNewsUpdate();
    } else if (lowerMessage.includes('market')) {
      return await getMarketUpdate();
    } else if (lowerMessage.includes('weather')) {
      return await getWeatherUpdate('Bermuda');
    } else {
      return "I'm sorry, I didn't understand that command. You can ask for 'news', 'market', or 'weather' updates, or manage your alerts with 'create alert', 'list alerts', 'update alert', or 'delete alert'.";
    }
  } catch (error) {
    console.error('Error in handleMessage:', error);
    return "An error occurred while processing your request. Please try again later.";
  }
}

async function handleCreateAlert(message, phoneNumber) {
  const parts = message.split(' ');
  if (parts.length !== 5) {
    return "To create an alert, use the format: create alert [type] [frequency] [time]. For example: create alert news daily 09:00";
  }
  const [, , type, frequency, time] = parts;
  const alertData = { phoneNumber, type, frequency, time };
  const result = await createAlert({ body: alertData });
  return result.error || `Alert created successfully: ${type} alert, ${frequency} at ${time}`;
}

async function handleListAlerts(phoneNumber) {
  const alerts = await getAlerts({ params: { phoneNumber } });
  if (alerts.error) return alerts.error;
  if (alerts.length === 0) return "You don't have any alerts set up.";
  return alerts.map(alert => `${alert.type} alert, ${alert.frequency} at ${alert.time}`).join('\n');
}

async function handleUpdateAlert(message, phoneNumber) {
  const parts = message.split(' ');
  if (parts.length !== 6) {
    return "To update an alert, use the format: update alert [alertId] [type] [frequency] [time]. For example: update alert 123456 news weekly 10:00";
  }
  const [, , alertId, type, frequency, time] = parts;
  const alertData = { type, frequency, time, enabled: true };
  const result = await updateAlert({ params: { alertId }, body: alertData });
  return result.error || `Alert updated successfully: ${type} alert, ${frequency} at ${time}`;
}

async function handleDeleteAlert(message, phoneNumber) {
  const parts = message.split(' ');
  if (parts.length !== 3) {
    return "To delete an alert, use the format: delete alert [alertId]. For example: delete alert 123456";
  }
  const [, , alertId] = parts;
  const result = await deleteAlert({ params: { alertId } });
  return result.error || "Alert deleted successfully";
}

module.exports = { handleMessage };
