import fs from 'fs';
import path from 'path';
import { conversationRepositories } from '../repositories/conversation.repositories';
import template from '../prompts/chatbot.txt';
import chatPersonality from '../prompts/personalityBot.txt';
import {
   getHistory,
   addMessage,
   resetHistory,
} from '../src/memory/chat.memory.ts';
import { llmClient } from '../llm/client.ts';

// const parkInfo = fs.readFileSync(
//    path.join(__dirname, '..', 'prompts', 'WonderWorld.md'),
//    'utf-8'
// );
// const instructions = template.replace('{parkInfo}', parkInfo);

type chatResponse = {
   id: string;
   message: string;
};

export const chatService = {
   async sendMessage(
      prompt: string,
      conversationId: string
   ): Promise<chatResponse> {
      if (prompt.trim() === '/reset') {
         await resetHistory();
         return {
            id: crypto.randomUUID(),
            message: '🆕 Conversation has been reset.',
         };
      }

      await addMessage({ role: 'user', content: prompt });

      const messagesString = getHistory()
         .map(
            (msg) =>
               `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
         )
         .join('\n');

      const response = await llmClient.generateText({
         model: 'gpt-4o-mini',
         prompt: messagesString,
         instructions: chatPersonality,
         maxTokens: 200,
         temperature: 0.2,
         previousResponseId:
            conversationRepositories.getLastResponseId(conversationId),
      });

      await addMessage({ role: 'assistant', content: response.text });

      conversationRepositories.setLastResponseId(conversationId, response.id);
      return {
         id: response.id,
         message: response.text,
      };
   },
};
