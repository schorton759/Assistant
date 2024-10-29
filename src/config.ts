interface Config {
  API_URL: string;
  DROPBOX_APP_KEY: string;
  DROPBOX_APP_SECRET: string;
  DROPBOX_FOLDER: string;
}

const config: Config = {
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  DROPBOX_APP_KEY: import.meta.env.VITE_DROPBOX_APP_KEY || '',
  DROPBOX_APP_SECRET: import.meta.env.VITE_DROPBOX_APP_SECRET || '',
  DROPBOX_FOLDER: import.meta.env.VITE_DROPBOX_FOLDER || '',
};

export default config;
