const { google } = require('googleapis');
const stream = require('stream');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

async function listFiles() {
  const res = await drive.files.list({
    pageSize: 10,
    fields: 'files(id, name, mimeType, webViewLink)',
    orderBy: 'modifiedTime desc'
  });
  return res.data.files;
}

async function uploadFile(file) {
  const bufferStream = new stream.PassThrough();
  bufferStream.end(file.buffer);

  const res = await drive.files.create({
    requestBody: {
      name: file.originalname,
      mimeType: file.mimetype
    },
    media: {
      mimeType: file.mimetype,
      body: bufferStream
    },
    fields: 'id, name, webViewLink'
  });
  return res.data;
}

async function searchFiles(query) {
  const res = await drive.files.list({
    q: `name contains '${query}'`,
    pageSize: 10,
    fields: 'files(id, name, mimeType, webViewLink)',
    orderBy: 'modifiedTime desc'
  });
  return res.data.files;
}

async function createFolder(folderName) {
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id, name'
  });
  return res.data;
}

module.exports = { listFiles, uploadFile, searchFiles, createFolder };