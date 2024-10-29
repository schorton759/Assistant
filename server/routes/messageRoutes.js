const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

router.post('/twilio', messageController.handleIncomingMessage);

module.exports = router;