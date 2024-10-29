const twilio = require('twilio');
const { handleMessage } = require('../services/messageHandler');

exports.handleIncomingMessage = async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const message = req.body.Body;
    const from = req.body.From.replace('whatsapp:', '');

    const response = await handleMessage(message, from);

    twiml.message(response);
  } catch (error) {
    console.error('Error handling message:', error);
    if (error.name === 'MongooseServerSelectionError') {
      twiml.message('Sorry, the service is temporarily unavailable. Please try again later.');
    } else {
      twiml.message('An error occurred while processing your message. Please try again later.');
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
};
