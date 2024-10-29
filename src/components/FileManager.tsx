import React, { useState, useEffect } from 'react';
import { DropboxFile, listDropboxFiles, getDropboxFileLink, uploadFile } from '../services/api';

const FileManager: React.FC = () => {
  const [files, setFiles] = useState<DropboxFile[]>([]);

  const fetchFiles = async () => {
    try {
      const fileList = await listDropboxFiles();
      setFiles(fileList);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await uploadFile(file);
        await fetchFiles(); // Refresh the file list after upload
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }
  };

  const handleGetLink = async (path: string | null) => {
    if (path) {
      try {
        const link = await getDropboxFileLink(path);
        console.log('File link:', link);
        // You can add logic here to display the link to the user
      } catch (error) {
        console.error('Error getting file link:', error);
      }
    } else {
      console.error('File path is null');
    }
  };

  return (
    <div>
      <h2>File Manager</h2>
      <input type="file" onChange={handleUpload} />
      <ul>
        {files.map((file) => (
          <li key={file.id}>
            {file.name}
            <button onClick={() => handleGetLink(file.path_lower)}>Get Link</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FileManager;
