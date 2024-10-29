const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  service: String,
  time: String,
  frequency: String,
  message: String,
  phoneNumber: String,
  status: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending'
  },
  lastTriggeredAt: Date,
  lastTriggeredContent: String
}, { timestamps: true });

module.exports = mongoose.model('Alert', AlertSchema);
