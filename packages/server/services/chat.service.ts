import { conversationRepositories } from '../repositories/conversation.repositories';
import template from '../prompts/chatbot.txt';
// // @ts-ignore
// import chatPersonality from '../prompts/chatPersonality.txt';

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
      console.log(
         '💬 [CHAT] Starting chat service for prompt:',
         prompt.substring(0, 50) + '...'
      );
      if (prompt.trim() === '/reset') {
         await resetHistory();
         console.log('🔄 [CHAT] Conversation reset.');
         return {
            id: crypto.randomUUID(),
            message: '🆕 Conversation has been reset.',
         };
      }

      await addMessage({ role: 'user', content: prompt });
      console.log('📝 [CHAT] Added user message to history.');

      const messagesString = getHistory()
         .slice(-10)
         .map(
            (msg) =>
               `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
         )
         .join('\n');

      console.log('📜 [CHAT] Retrieved conversation history.');

      console.log('🤖 [CHAT] Calling LLM for response...');
      const response = await llmClient.generateText({
         model: 'gpt-4o',
         prompt: template + '\n\n' + messagesString,
         instructions:
            'always check you syntax and make t human readable. and be sure to only answer the last qestion and not the whole conversation history',
         maxTokens: 200,
         temperature: 0.2,
         previousResponseId:
            conversationRepositories.getLastResponseId(conversationId),
      });

      console.log(
         '✅ [CHAT] LLM response received. Length:',
         response.text.length
      );
      await addMessage({ role: 'assistant', content: response.text });
      console.log('💾 [CHAT] Added assistant response to history.');

      conversationRepositories.setLastResponseId(conversationId, response.id);
      console.log('🎯 [CHAT] Chat service completed.');
      return {
         id: response.id,
         message: response.text,
      };
   },
};
