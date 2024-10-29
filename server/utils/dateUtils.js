const moment = require('moment-timezone');

exports.formatDate = (date, timezone) => {
  return moment(date).tz(timezone);
};

