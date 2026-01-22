import { Kafka } from 'kafkajs';
import { llmClient } from '../packages/server/llm/client';
import classifierPrompt from '../prompts/json-hander.txt';

const kafka = new Kafka({
   clientId: 'llm-json-handler',
   brokers: ['localhost:9092'],
});
const consumer = kafka.consumer({ groupId: 'llm-json-handler-group' });
const producer = kafka.producer();

async function start() {
   await consumer.connect();
   await producer.connect();

   await consumer.subscribe({ topic: 'router_decision_events' });
   console.log('🧭 LLM JSON Handler running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         const routerDecision = message.value.toString();

         // Call LLM with JSON-enforcing prompt
         const response = await llmClient.generateText({
            prompt: routerDecision,
            instructions: classifierPrompt,
            maxTokens: 200,
         });

         console.log(response);

         // Publish raw LLM JSON to Kafka
         await producer.send({
            topic: 'llm_response_events',
            messages: [{ key: userId, value: response.text }],
         });
      },
   });
}

start().catch(console.error);
