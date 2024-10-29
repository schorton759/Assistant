const { saveLocally, getLocally } = require('./localStorageService');

async function someOperation(data) {
  try {
    // Try database operation
    return await databaseOperation(data);
  } catch (error) {
    if (error.name === 'MongooseServerSelectionError') {
      // Fallback to local storage
      await saveLocally('someKey', data);
      return { message: 'Data saved locally due to database unavailability' };
    }
    throw error;
  }
}
