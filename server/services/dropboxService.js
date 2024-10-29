const { Dropbox } = require('dropbox');
const fetch = require('isomorphic-fetch');

const dbx = new Dropbox({ 
  accessToken: process.env.DROPBOX_ACCESS_TOKEN,
  fetch: fetch
});

async function uploadFile(fileInfo) {
  try {
    const path = `${process.env.DROPBOX_FOLDER}/${fileInfo.originalname}`;
    const response = await dbx.filesUpload({path, contents: fileInfo.buffer});
    console.log('File uploaded successfully:', response);
    return response;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

async function getDropboxLink(path) {
  try {
    const response = await dbx.sharingCreateSharedLinkWithSettings({path});
    return response.result.url;
  } catch (error) {
    console.error('Error getting Dropbox link:', error);
    if (error.status === 401 && error.error && error.error.error && error.error.error['.tag'] === 'missing_scope') {
      return 'Unable to generate link: The app is missing required permissions. Please contact the administrator.';
    }
    return 'Unable to generate link due to an unexpected error.';
  }
}

module.exports = { uploadFile, getDropboxLink };
