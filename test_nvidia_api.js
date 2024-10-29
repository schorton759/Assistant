require('dotenv').config();
const { generateResponse } = require('./server/services/aiService');

async function testNvidiaAPI() {
  console.log("Starting NVIDIA API test...");
  try {
    const prompt = "Write a limerick about the wonders of GPU computing.";
    console.log("Sending prompt to NVIDIA API:", prompt);
    
    const response = await generateResponse(prompt);
    console.log("Response from NVIDIA API:");
    console.log(response);
    
    console.log("\nNVIDIA API test completed.");
  } catch (error) {
    console.error("Error testing NVIDIA API:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    } else if (error.request) {
      console.error("No response received. Request details:", error.request);
    } else {
      console.error("Error details:", error);
    }
  }
}

testNvidiaAPI().then(() => {
  console.log("Test script execution completed.");
}).catch((error) => {
  console.error("Unhandled error in test script:", error);
});
