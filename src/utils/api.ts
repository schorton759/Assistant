import axios, { AxiosResponse } from 'axios';
import { Dropbox } from 'dropbox';
import config from '../config';

const dropbox = new Dropbox({
  clientId: config.DROPBOX_APP_KEY,
  clientSecret: config.DROPBOX_APP_SECRET
});

interface ApiResponse<T> {
  data: T;
  status: number;
}

export async function get<T>(url: string): Promise<ApiResponse<T>> {
  try {
    const response: AxiosResponse<T> = await axios.get(url);
    return { data: response.data, status: response.status };
  } catch (error) {
    console.error('API GET error:', error);
    throw error;
  }
}

export async function post<T>(url: string, data: any): Promise<ApiResponse<T>> {
  try {
    const response: AxiosResponse<T> = await axios.post(url, data);
    return { data: response.data, status: response.status };
  } catch (error) {
    console.error('API POST error:', error);
    throw error;
  }
}

export const uploadFile = async (file: File): Promise<any> => {
  try {
    const response = await dropbox.filesUpload({ path: '/' + file.name, contents: file });
    console.log('File uploaded successfully:', response);
    return response;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('Failed to upload file to Dropbox');
  }
};

export const sendMessage = async (to: string, body: string): Promise<any> => {
  try {
    const response = await post(`${config.API_URL}/api/send-message`, { to, body });
    console.log('Message sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw new Error('Failed to send message');
  }
};

export const chatWithAI = async (message: string): Promise<any> => {
  try {
    const response = await post(`${config.API_URL}/api/chat`, { message });
    console.log('AI response received:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error chatting with AI:', error);
    throw new Error('Failed to chat with AI');
  }
};

export const listDropboxFiles = async (limit: number = 20, offset: number = 0): Promise<any[]> => {
  try {
    const response = await dropbox.filesListFolder({
      path: config.DROPBOX_FOLDER,
      limit: limit
    });
    console.log('Files listed successfully');
    return response.result.entries;
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
