# WhatsApp AI Assistant

## Overview

The WhatsApp AI Assistant is a sophisticated, AI-powered chatbot that integrates with WhatsApp to provide a wide range of services and information. It leverages OpenAI's GPT models, various APIs, and custom tools to offer an intelligent and versatile assistant accessible through WhatsApp.

## Features

- **Natural Language Processing**: Understands and responds to user queries in natural language.
- **Web Search**: Performs web searches to provide up-to-date information.
- **Financial Data**: Fetches real-time stock market data and cryptocurrency information.
- **News Summaries**: Provides summaries of the latest news on various topics.
- **Weather Information**: Offers current weather data for specified locations.
- **Currency Conversion**: Converts between different currencies using real-time exchange rates.
- **Reminders**: Sets and manages reminders for users.
- **File Management**: Integrates with Dropbox for file storage and retrieval.
- **Text and Image Analysis**: Analyzes text and images using AI models.
- **Movie Recommendations**: Suggests movies based on genre and decade preferences.
- **Mathematical Calculations**: Performs complex calculations and data processing.
- **Python Code Execution**: Allows execution of Python code for advanced computations.

## Technology Stack

- **Backend**: Node.js with Express.js
- **Frontend**: React with Vite
- **AI/ML**: OpenAI GPT models
- **APIs**: Twilio (WhatsApp), Dropbox, Financial Modeling Prep, Alpha Vantage, News API, Serper, OpenWeatherMap
- **Database**: Redis for caching and session management
- **Deployment**: Supports deployment on various cloud platforms

## Installation

For detailed installation instructions, please refer to the [INSTALLATION.md](INSTALLATION.md) file.

## Usage

Once installed and configured, users can interact with the AI Assistant by sending messages to the associated WhatsApp number. The assistant will process the messages, utilize the appropriate tools or APIs, and respond with relevant information or actions.

Example interactions:
- "What's the weather like in New York?"
- "Set a reminder to call mom tomorrow at 2 PM"
- "Give me a summary of the latest tech news"
- "What's the current price of Bitcoin?"

## API Rate Limiting

The application implements API rate limiting to ensure compliance with free tier restrictions of various APIs. Usage warnings are provided at 50% of the limit, and services become unavailable when limits are reached.

## Contributing

We welcome contributions to the WhatsApp AI Assistant project. Please read our [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to make contributions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the GitHub repository or contact the maintainers directly.

## Acknowledgements

We would like to thank all the API providers and open-source projects that made this AI Assistant possible.

## Disclaimer

This project is for educational and personal use only. Ensure compliance with WhatsApp's terms of service and the terms of all integrated APIs when using this assistant.
