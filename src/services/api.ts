import axios from 'axios';
import { Dropbox, files } from 'dropbox';
import config from '../config';

const dropbox = new Dropbox({
  clientId: config.DROPBOX_APP_KEY,
  clientSecret: config.DROPBOX_APP_SECRET
});

interface MessageResponse {
  success: boolean;
  messageId: string;
}

export const sendMessage = async (to: string, body: string) => {
  try {
    const response = await axios.post(`${config.API_URL}/api/send-message`, { to, body });
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

export interface DropboxFile {
  name: string;
  path_lower: string | null;
  id: string;
}

export const uploadFile = async (file: File): Promise<DropboxFile> => {
  try {
    const response = await dropbox.filesUpload({ path: '/' + file.name, contents: file });
    return {
      name: response.result.name,
      path_lower: response.result.path_lower || null,
      id: response.result.id
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('Failed to upload file to Dropbox');
  }
};

export const listDropboxFiles = async (limit: number = 20, offset: number = 0): Promise<DropboxFile[]> => {
  try {
    const response = await dropbox.filesListFolder({
      path: config.DROPBOX_FOLDER,
      limit: limit
    });
    console.log('Files listed successfully');
    return response.result.entries.map(entry => {
      if (entry['.tag'] === 'file') {
        const fileEntry = entry as files.FileMetadataReference;
        return {
          name: fileEntry.name,
          path_lower: fileEntry.path_lower || null,
          id: fileEntry.id
        };
      }
      // Handle folder entries or other types if needed
      throw new Error('Unsupported entry type');
    });
  } catch (error) {
    console.error('Error listing Dropbox files:', error);
    throw new Error(`Failed to list Dropbox files`);
  }
};

export const getDropboxFileLink = async (filePath: string): Promise<string> => {
  try {
    const response = await dropbox.sharingCreateSharedLink({ path: filePath });
    console.log('Shared link created:', response.result.url);
    return response.result.url;
  } catch (error) {
    console.error('Error creating shared link:', error);
    throw new Error('Failed to create Dropbox shared link');
  }
};

interface AIResponse {
  message: string;
  content: string;
  confidence: number;
}

export const chatWithAI = async (message: string) => {
  try {
    const response = await axios.post(`${config.API_URL}/api/chat`, { message });
    return response.data;
  } catch (error) {
    console.error('Error chatting with AI:', error);
    throw error;
  }
};

export const sendWhatsAppMessage = async (to: string, body: string): Promise<any> => {
  try {
    const response = await axios.post(`${config.API_URL}/api/send-whatsapp`, { to, body });
    console.log('WhatsApp message sent successfully:', response.data.messageSid);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error sending WhatsApp message:', error.message);
      throw new Error(error.message || 'Failed to send WhatsApp message');
    }
    throw new Error('Failed to send WhatsApp message');
  }
};

export const downloadFile = async (filePath: string): Promise<any> => {
  try {
    const response = await dropbox.filesDownload({ path: filePath });
    console.log('File downloaded successfully:', response.result.name);
    return response.result;
  } catch (error) {
    console.error('Error downloading file:', error);
    throw new Error('Failed to download file from Dropbox');
  }
};

// Implement a simple rate limiter
const rateLimiter = <T extends (...args: any[]) => Promise<any>>(func: T, limit: number) => {
  const queue: { args: Parameters<T>; resolve: (value: ReturnType<T>) => void; reject: (reason?: any) => void }[] = [];
  let ongoing = 0;

  const dequeue = () => {
    if (queue.length && ongoing < limit) {
      const { args, resolve, reject } = queue.shift()!;
      ongoing++;
      func(...args)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          ongoing--;
          dequeue();
        });
    }
  };

  return (...args: Parameters<T>): Promise<ReturnType<T>> =>
    new Promise((resolve, reject) => {
      queue.push({ args, resolve, reject });
      dequeue();
    });
};

// Apply rate limiting to API calls
export const rateLimitedUploadFile = rateLimiter(uploadFile, 2);
