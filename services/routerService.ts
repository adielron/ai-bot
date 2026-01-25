import { Kafka } from 'kafkajs';
import { type ConversationHistory } from '../shared/types';
import { llmClient } from '../packages/server/llm/client';
import { type IntentDetectionResult } from '../shared/types';
import classifier from '../prompts/Classifier.txt';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'router-service',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'router-service-group' });
const producer = kafka.producer();

// Cache latest conversation history per user
const historyCache = new Map<string, ConversationHistory[]>();

/* ---------------- Intent Detection ---------------- */
async function detectIntent(userInput: string): Promise<IntentDetectionResult> {
   // Inject user input into the Few-Shot prompt

   const response = await llmClient.generateText({
      prompt: userInput,
      instructions: classifier, // Optional, you can leave empty if already in prompt
      maxTokens: 150,
   });

   const text = response.text.trim();

   try {
      return JSON.parse(text);
   } catch (err) {
      console.error('❌ Failed to parse intent:', text);
      return { intent: 'chat', parameters: {}, confidence: 0.0 }; // Safe fallback
   }
}

/* ---------------- Main ---------------- */
async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'PlanStepRequested' });
   await consumer.subscribe({ topic: 'conversation-history-update' });

   console.log('🧭 RouterService is running');

   await consumer.run({
      eachMessage: async ({ topic, message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         const MemoryUpdatedevent = JSON.parse(
            message.value.toString()
         ) as BaseEvent;

         // Handle conversation history updates
         if (topic === 'conversation-history-update') {
            if (!MemoryUpdatedevent.payload) return;
            const history = JSON.parse(
               MemoryUpdatedevent.payload
            ) as ConversationHistory[];
            historyCache.set(userId, history);
            return;
         }

         // Handle user input
         if (topic === 'PlanStepRequested') {
            const userEvent = JSON.parse(message.value.toString()) as BaseEvent;
            const userInput = userEvent.payload;
            // Handle reset command
            if (userInput === '/reset') {
               const resetEvent: BaseEvent = {
                  eventType: 'ConversationReset',
                  conversationId: userId,
                  timestamp: Date.now(),
                  payload: '/reset',
               };

               await producer.send({
                  topic: 'user-control-events',
                  messages: [
                     { key: userId, value: JSON.stringify(resetEvent) },
                  ],
               });
               historyCache.delete(userId);
               return;
            }

            // Detect intent using Few-Shot classifier
            const intent = await detectIntent(userInput);

            console.log('➡️ Router decision:', intent);

            // Publish intent to router_decision_events

            const routerDecisionEvent: BaseEvent = {
               eventType: 'RouterDecisionMade',
               conversationId: userId,
               timestamp: Date.now(),
               payload: JSON.stringify(intent),
            };

            await producer.send({
               topic: 'tool-invocation-requests',
               messages: [
                  { key: userId, value: JSON.stringify(routerDecisionEvent) },
               ],
            });
         }
      },
   });
}

start().catch(console.error);
