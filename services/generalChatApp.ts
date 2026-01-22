import { Kafka } from 'kafkajs';
import { llmClient } from '../packages/server/llm/client';
import { type ConversationHistory } from '../shared/types';
import persona from '../prompts/persona.txt';

const kafka = new Kafka({
   clientId: 'general-chat-app',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'general-chat-app-group' });
const producer = kafka.producer();

/* ---------------- LLM Prompt ---------------- */
function buildChatPrompt(
   history: ConversationHistory[] = [],
   userInput: string
) {
   const messages = history.map((msg) => ({
      role: msg.role,
      content: msg.content,
   }));

   messages.push({
      role: 'user',
      content: userInput,
   });

   return messages;
}

/* ---------------- Main ---------------- */
async function start() {
   await producer.connect();
   await consumer.connect();

   // Subscribe to user input events and updates from memory
   await consumer.subscribe({ topic: 'intent-general-chat' });
   await consumer.subscribe({ topic: 'conversation-history-update' });

   // Keep track of latest conversation history per user
   const historyCache = new Map<string, ConversationHistory[]>();

   console.log('🤖 GeneralChatApp is running');

   await consumer.run({
      eachMessage: async ({ topic, message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         if (topic === 'conversation-history-update') {
            // Update cached conversation history
            const history = JSON.parse(
               message.value.toString()
            ) as ConversationHistory[];
            historyCache.set(userId, history);
            return;
         }

         if (topic === 'intent-general-chat') {
            const userInput = message.value.toString();

            // Build prompt using cached history
            const messages = buildChatPrompt(
               historyCache.get(userId) ?? [],
               userInput
            );

            console.log('Prompt to LLM:', messages);

            const response = await llmClient.generateText({
               prompt: JSON.stringify(messages),
               maxTokens: 200,
               instructions: persona,
            });

            const result = response.text.trim();

            // Publish result to app-results
            await producer.send({
               topic: 'app-results',
               messages: [
                  {
                     key: userId,
                     value: JSON.stringify({
                        type: 'chat',
                        result,
                     }),
                  },
               ],
            });
         }
      },
   });
}

start().catch(console.error);
