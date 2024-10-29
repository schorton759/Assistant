const twilio = require('twilio');
const logger = require('../utils/logger');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendWhatsAppMessage(to, body) {
  try {
    // Clean up phone numbers - remove any comments or whitespace
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER.split('#')[0].trim();
    const toNumber = to.replace('whatsapp:', '').trim();

    logger.info(`Sending WhatsApp message to ${toNumber}`);

    const message = await client.messages.create({
      body: body,
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${toNumber}`
    });

    logger.info(`Message sent successfully, SID: ${message.sid}`);
    return message;
  } catch (error) {
    logger.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

module.exports = { sendWhatsAppMessage };
