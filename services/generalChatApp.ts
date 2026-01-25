import { Kafka } from 'kafkajs';
import { llmClient } from '../packages/server/llm/client';
import { type ConversationHistory, type BaseEvent } from '../shared/types';
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

   // Subscribe to user input events and conversation history updates
   await consumer.subscribe({ topic: 'intent-general-chat' });
   await consumer.subscribe({ topic: 'conversation-history-update' });

   const historyCache = new Map<string, ConversationHistory[]>();

   console.log('🤖 GeneralChatApp is running');

   await consumer.run({
      eachMessage: async ({ topic, message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         if (topic === 'conversation-history-update') {
            // Update cached conversation history
            const event = JSON.parse(message.value.toString()) as BaseEvent;
            if (!event.payload) return;

            const history = JSON.parse(event.payload) as ConversationHistory[];
            historyCache.set(userId, history);
            return;
         }

         if (topic === 'intent-general-chat') {
            const event = JSON.parse(message.value.toString()) as BaseEvent;
            const userInput = event.payload;

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

            // Wrap result as BaseEvent
            const chatEvent: BaseEvent = {
               eventType: 'chatResult',
               conversationId: userId,
               timestamp: Date.now(),
               payload: result, // only string
            };

            // Publish result to ToolInvocationResulted
            await producer.send({
               topic: 'ToolInvocationResulted',
               messages: [{ key: userId, value: JSON.stringify(chatEvent) }],
            });
         }
      },
   });
}

start().catch(console.error);
