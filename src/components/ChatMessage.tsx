import React from 'react'
import { Message } from '../types'
import { User, Bot } from 'lucide-react'

interface ChatMessageProps {
  message: Message
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.sender === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex items-end ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${isUser ? 'bg-blue-500' : 'bg-gray-300'} text-white`}>
          {isUser ? <User size={20} /> : <Bot size={20} />}
        </div>
        <div className={`max-w-xs mx-2 p-3 rounded-lg ${isUser ? 'bg-blue-500 text-white' : 'bg-white'}`}>
          <p>{message.text}</p>
        </div>
      </div>
    </div>
  )
}

export default ChatMessage