# WhatsApp AI Assistant Installation Guide

## Prerequisites

Before you begin the installation process, ensure you have the following:

1. Node.js (v14.0.0 or later)
2. npm (v6.0.0 or later)
3. Git
4. A Twilio account with WhatsApp API access
5. An OpenAI API key
6. A Dropbox account with API access
7. API keys for Financial Modeling Prep, Alpha Vantage, News API, and Serper
8. A Redis Cloud account

## Step-by-Step Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/whatsapp-ai-assistant.git
   cd whatsapp-ai-assistant
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add the following:
   ```
   OPENAI_API_KEY=your_openai_api_key
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_WHATSAPP_NUMBER=your_twilio_whatsapp_number
   DROPBOX_APP_KEY=your_dropbox_app_key
   DROPBOX_APP_SECRET=your_dropbox_app_secret
   DROPBOX_ACCESS_TOKEN=your_dropbox_access_token
   DROPBOX_FOLDER=/Assistant
   VITE_API_URL=your_ngrok_url
   OPENWEATHER_API_KEY=your_openweather_api_key
   EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key
   REDIS_URL=your_redis_cloud_url
   FMP_API_KEY=your_financial_modeling_prep_api_key
   VITE_ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key
   VITE_NEWS_API_KEY=your_news_api_key
   VITE_SERPER_API_KEY=your_serper_api_key
   SERPER_API_LIMIT=100
   FMP_API_LIMIT=250
   NEWS_API_LIMIT=100
   ALPHA_VANTAGE_API_LIMIT=500
   ```

   Replace all `your_*` placeholders with your actual API keys and credentials.

4. Set up Twilio Webhook:
   - Go to your Twilio Console
   - Navigate to Messaging > Settings > WhatsApp Sandbox Settings
   - Set the "When a message comes in" URL to `https://your-ngrok-url.ngrok.io/webhook`

5. Start the development server:
   ```
   npm run dev
   ```

6. In a separate terminal, start ngrok to expose your local server:
   ```
   ngrok http 3000
   ```

7. Update the `VITE_API_URL` in your `.env` file with the new ngrok URL.

8. Restart your development server.

## Verifying the Installation

1. Send a message to your Twilio WhatsApp number.
2. Check the console logs to ensure the message is received and processed.
3. Verify that you receive a response from the AI assistant.

## Troubleshooting

- If you encounter any "Module not found" errors, ensure all dependencies are installed by running `npm install` again.
- If the WhatsApp messages are not being received, double-check your Twilio webhook URL and ensure ngrok is running.
- For any API-related issues, verify that all API keys in the `.env` file are correct and have the necessary permissions.

## Updating

To update the WhatsApp AI Assistant to the latest version:

1. Pull the latest changes:
   ```
   git pull origin main
   ```

2. Install any new dependencies:
   ```
   npm install
   ```

3. Check for any new environment variables in the updated INSTALLATION.md and add them to your `.env` file.

4. Restart your development server.

For any further assistance, please refer to the documentation or open an issue on the GitHub repository.
