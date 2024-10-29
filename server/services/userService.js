const User = require('../models/User');
const logger = require('../utils/logger');

async function updateUserPreferences(phoneNumber, preferences) {
  try {
    const user = await User.findOneAndUpdate(
      { phoneNumber },
      { $set: { preferences } },
      { new: true }
    );
    return user;
  } catch (error) {
    logger.error('Error updating user preferences:', error);
    throw error;
  }
}

async function getUserPreferences(phoneNumber) {
  try {
    const user = await User.findOne({ phoneNumber });
    return user?.preferences;
  } catch (error) {
    logger.error('Error getting user preferences:', error);
    throw error;
  }
}

module.exports = { updateUserPreferences, getUserPreferences };
