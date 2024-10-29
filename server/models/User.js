const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['news', 'market', 'weather'],
    required: true
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily'
  },
  time: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  name: String,
  preferences: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    language: {
      type: String,
      default: 'en'
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  alerts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alert'
  }],
  lastInteraction: Date,
  status: {
    type: String,
    enum: ['active', 'inactive', 'blocked'],
    default: 'active'
  },
  registrationDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

userSchema.index({ phoneNumber: 1 });

module.exports = mongoose.model('User', userSchema);
