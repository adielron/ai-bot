import { Kafka } from 'kafkajs';
import { llmClient } from '../packages/server/llm/client';
import classifierPrompt from '../prompts/json-hander.txt';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'llm-json-handler',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'llm-json-handler-group' });
const producer = kafka.producer();

async function start() {
   await consumer.connect();
   await producer.connect();

   await consumer.subscribe({ topic: 'tool-worker-requests' });
   console.log('🧭 LLM JSON Handler running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         console.log('📩 Received tool worker request.');

         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         // Parse incoming router decision as BaseEvent
         const routerDecisionEvent = JSON.parse(
            message.value.toString()
         ) as BaseEvent;

         // Call LLM with JSON-enforcing prompt
         const response = await llmClient.generateText({
            prompt: routerDecisionEvent.payload, // user input or intent JSON
            instructions: classifierPrompt,
            maxTokens: 200,
         });

         console.log('🧠 LLM JSON Response:', response.text);

         // Wrap LLM output as BaseEvent
         const llmResponseEvent: BaseEvent = {
            eventType: 'LLMJSONGenerated',
            conversationId: userId,
            timestamp: Date.now(),
            payload: response.text, // the JSON string from LLM
         };

         // Publish to llm_response_events
         await producer.send({
            topic: 'llm_response_events',
            messages: [
               { key: userId, value: JSON.stringify(llmResponseEvent) },
            ],
         });
      },
   });
}

start().catch(console.error);
