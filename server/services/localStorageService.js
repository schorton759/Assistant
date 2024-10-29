const fs = require('fs').promises;
const path = require('path');

const storageDir = path.join(__dirname, '../../local_storage');

async function saveLocally(key, data) {
  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(path.join(storageDir, `${key}.json`), JSON.stringify(data));
}

async function getLocally(key) {
  try {
    const data = await fs.readFile(path.join(storageDir, `${key}.json`), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

module.exports = { saveLocally, getLocally };
