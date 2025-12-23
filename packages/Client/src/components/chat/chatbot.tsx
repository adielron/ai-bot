import axios from 'axios';
import { useRef, useState } from 'react';
import TypingIndicator from './typingIndicator';

import type { Message } from './ChatMessages';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

import type { ChatFormData } from './ChatInput';

import popSound from '@/assets/sounds/pop.mp3';
import notifcationSound from '@/assets/sounds/notification.mp3';

const popAudio = new Audio(popSound);
popAudio.volume = 0.2;
const notifAudio = new Audio(notifcationSound);
notifAudio.volume = 0.2;

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
         popAudio.play();
         const { data } = await axios.post<chatResponse>('/api/agent', {
            prompt,
            conversationId: conversationId.current,
         });
         setMessages((prev) => [
            ...prev,
            { content: data.message, role: 'bot' },
         ]);
         notifAudio.play();
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
