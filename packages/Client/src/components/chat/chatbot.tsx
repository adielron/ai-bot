import axios from 'axios';
import { useRef, useState } from 'react';
import TypingIndicator from './typingIndicator';

import type { Message } from './ChatMessages';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

import type { ChatFormData } from './ChatInput';

type chatResponse = {
   message: string;
};

const chatbot = () => {
   const [messages, setMessages] = useState<Message[]>([]);
   const [isBotTyping, setbotTyping] = useState(false);
   const [error, setError] = useState('');
   const conversationId = useRef(crypto.randomUUID());

   const onSumbit = async ({ prompt }: ChatFormData) => {
      try {
         setError('');
         setMessages((prev) => [...prev, { content: prompt, role: 'user' }]);
         setbotTyping(true);
         const { data } = await axios.post<chatResponse>('/api/chat', {
            prompt,
            conversationId: conversationId.current,
         });
         setMessages((prev) => [
            ...prev,
            { content: data.message, role: 'bot' },
         ]);
         setbotTyping(false);
      } catch (error) {
         console.error(error);
         setError('An error occurred. Please try again.');
      } finally {
         setbotTyping(false);
      }
   };

   return (
      <div className="flex flex-col   h-full">
         <div className="flex flex-col flex-1 gap-3 mb-10 overflow-y-auto">
            <ChatMessages messages={messages} />
            {isBotTyping && <TypingIndicator />}
            {error && <p className="text-red-500">{error}</p>}
         </div>
         <ChatInput onSubmit={onSumbit} />
      </div>
   );
};

export default chatbot;
