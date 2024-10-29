exports.validateAlertInput = (alerts) => {
  const errors = [];
  const validTypes = ['news', 'market', 'weather'];
  const validFrequencies = ['daily', 'weekly', 'monthly'];

  if (!Array.isArray(alerts)) {
    return ['Alerts must be an array'];
  }

  alerts.forEach((alert, index) => {
    if (!validTypes.includes(alert.type)) {
      errors.push(`Invalid alert type at index ${index}`);
    }
    if (!validFrequencies.includes(alert.frequency)) {
      errors.push(`Invalid frequency at index ${index}`);
    }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(alert.time)) {
      errors.push(`Invalid time format at index ${index}`);
    }
    if (typeof alert.enabled !== 'boolean') {
      errors.push(`Enabled must be a boolean at index ${index}`);
    }
  });

  return errors;
};

