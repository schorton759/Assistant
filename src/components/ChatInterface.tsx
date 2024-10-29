import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { sendMessage, chatWithAI } from '../services/api';

interface Message {
  text: string;
  sender: 'user' | 'ai' | 'system';
}

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessage: Message = { text: input, sender: 'user' };
    setMessages([...messages, newMessage]);
    setInput('');

    try {
      console.log('Sending message:', input);
      await sendMessage(phoneNumber, input);

      // Get AI response
      const aiResponse = await chatWithAI(input);
      setMessages(prev => [...prev, { text: aiResponse.content, sender: 'ai' }]);

      // Send AI response via WhatsApp
      await sendMessage(phoneNumber, aiResponse.content);
      console.log('Message sent result:', aiResponse);
    } catch (error) {
      console.error('Error in chat:', error);
      setMessages(prev => [...prev, { text: 'Error: Failed to process message', sender: 'system' }]);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Chat</h2>
      <div className="mb-4">
        <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">WhatsApp Number</label>
        <input
          id="phoneNumber"
          type="text"
          value={phoneNumber}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhoneNumber(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          placeholder="+1234567890"
        />
      </div>
      <div className="h-96 overflow-y-auto mb-4 p-4 border border-gray-200 rounded-lg">
        {messages.map((message, index) => (
          <div key={index} className={`mb-2 ${message.sender === 'user' ? 'text-right' : 'text-left'}`}>
            <span className={`inline-block p-2 rounded-lg ${message.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
              {message.text}
            </span>
          </div>
        ))}
      </div>
      <div className="flex">
        <input
          type="text"
          value={input}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          className="flex-grow mr-2 p-2 border border-gray-300 rounded-lg"
          placeholder="Type your message..."
        />
        <button onClick={handleSend} className="bg-blue-500 text-white p-2 rounded-lg">
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
