import axios from 'axios';

const API_BASE_URL = 'https://www.googleapis.com/drive/v3';

export async function listFiles(accessToken: string) {
  try {
    const response = await axios.get(`${API_BASE_URL}/files`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        fields: 'files(id, name, mimeType, webViewLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 10,
      },
    });
    return response.data.files;
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

export async function uploadFile(accessToken: string, file: File) {
  try {
    const metadata = {
      name: file.name,
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await axios.post(`${API_BASE_URL}/files`, form, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'multipart/form-data',
      },
      params: {
        uploadType: 'multipart',
        fields: 'id,name,webViewLink',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

export async function searchFiles(accessToken: string, query: string) {
  try {
    const response = await axios.get(`${API_BASE_URL}/files`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        q: query,
        fields: 'files(id, name, mimeType, webViewLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 10,
      },
    });
    return response.data.files;
  } catch (error) {
    console.error('Error searching files:', error);
    throw error;
  }
}

export async function createFolder(accessToken: string, folderName: string) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/files`,
      {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}