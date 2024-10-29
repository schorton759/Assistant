const User = require('../models/User');  // Update this line
const { validateAlertInput } = require('../utils/validators');
const { scheduleAlert } = require('../services/schedulerService');
const Alert = require('../models/Alert');  // Changed from '../../models/Alert'
const logger = require('../utils/logger');

exports.updateAlerts = async (req, res) => {
  const { phoneNumber, alerts } = req.body;
  
  try {
    const validationErrors = validateAlertInput(alerts);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    const user = await User.findOneAndUpdate(
      { phoneNumber },
      { $set: { alerts } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(user.alerts);
  } catch (error) {
    console.error('Failed to update alerts:', error);
    res.status(500).json({ error: 'Failed to update alerts' });
  }
};

exports.getAlerts = async ({ params }) => {
  try {
    const user = await User.findOne({ phoneNumber: params.phoneNumber });
    if (!user) {
      return { error: 'User not found' };
    }
    return user.alerts;
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    return { error: 'Failed to fetch alerts' };
  }
};

exports.deleteAlert = async ({ params }) => {
  try {
    const user = await User.findOneAndUpdate(
      { 'alerts._id': params.alertId },
      { $pull: { alerts: { _id: params.alertId } } },
      { new: true }
    );
    if (!user) {
      return { error: 'Alert not found' };
    }
    return { message: 'Alert deleted successfully' };
  } catch (error) {
    console.error('Failed to delete alert:', error);
    return { error: 'Failed to delete alert' };
  }
};

exports.createAlert = async (req, res) => {
  try {
    const { phoneNumber, service, time, frequency, message } = req.body;
    const newAlert = new Alert({
      phoneNumber,
      service,
      time,
      frequency,
      message,
      status: 'pending'
    });
    await newAlert.save();
    logger.info(`New alert created: ${JSON.stringify(newAlert)}`);
    res.status(201).json(newAlert);
  } catch (error) {
    logger.error('Failed to create alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
};

exports.updateAlert = async ({ params, body }) => {
  try {
    const { type, frequency, time, enabled } = body;
    const user = await User.findOneAndUpdate(
      { 'alerts._id': params.alertId },
      { $set: { 
        'alerts.$.type': type,
        'alerts.$.frequency': frequency,
        'alerts.$.time': time,
        'alerts.$.enabled': enabled
      }},
      { new: true }
    );
    if (!user) {
      return { error: 'Alert not found' };
    }
    const updatedAlert = user.alerts.id(params.alertId);
    scheduleAlert(updatedAlert, user.phoneNumber);
    return updatedAlert;
  } catch (error) {
    console.error('Failed to update alert:', error);
    return { error: 'Failed to update alert' };
  }
};

exports.getPendingAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.json({ alerts });
  } catch (error) {
    logger.error('Failed to fetch pending alerts:', error);
    res.status(500).json({ error: 'Failed to fetch pending alerts' });
  }
};

exports.getCompletedAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({ status: 'completed' }).sort({ lastTriggeredAt: -1 });
    res.json({ alerts });
  } catch (error) {
    logger.error('Failed to fetch completed alerts:', error);
    res.status(500).json({ error: 'Failed to fetch completed alerts' });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    const result = await Alert.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
};

exports.updateAlert = async (req, res) => {
  try {
    const { service, time, frequency, message, status } = req.body;
    const updatedAlert = await Alert.findByIdAndUpdate(
      req.params.id,
      { service, time, frequency, message, status },
      { new: true, runValidators: true }
    );
    if (!updatedAlert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json(updatedAlert);
  } catch (error) {
    logger.error('Failed to update alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
};
