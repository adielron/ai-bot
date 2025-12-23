import fs from 'fs';
import path from 'path';
import { conversationRepositories } from '../repositories/conversation.repositories';
import OpenAI from 'openai';
import template from '../prompts/chatbot.txt';
import {
   getHistory,
   addMessage,
   resetHistory,
} from '../src/memory/chat.memory.ts';

const client = new OpenAI({
   apiKey: process.env.OPENAI_API_KEY,
});

const parkInfo = fs.readFileSync(
   path.join(__dirname, '..', 'prompts', 'WonderWorld.md'),
   'utf-8'
);
const instructions = template.replace('{parkInfo}', parkInfo);

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

      const messages = getHistory().map((msg) => ({
         role: msg.role,
         content: msg.content,
      }));

      const response = await client.responses.create({
         model: 'gpt-4o-mini',
         instructions,
         input: messages,
         temperature: 0.2,
         max_output_tokens: 200,
         previous_response_id:
            conversationRepositories.getLastResponseId(conversationId),
      });

      await addMessage({ role: 'assistant', content: response.output_text });

      conversationRepositories.setLastResponseId(conversationId, response.id);
      return {
         id: response.id,
         message: response.output_text,
      };
   },
};
