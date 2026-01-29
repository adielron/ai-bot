import { Kafka } from 'kafkajs';
import { llmClient } from '../packages/server/llm/client';
import cotPromptTemplate from '../prompts/cotPromptTemplate.txt';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'cot-math-service',
   brokers: ['localhost:9092'],
});
const consumer = kafka.consumer({ groupId: 'cot-math-service-group' });
const producer = kafka.producer();

async function start() {
   await consumer.connect();
   await producer.connect();
   await consumer.subscribe({ topic: 'intent-math-bot' });

   console.log('🧮 CoT Math Service running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         let event: BaseEvent;
         try {
            event = JSON.parse(message.value.toString()) as BaseEvent;
            console.log(event);
         } catch {
            console.error(
               '❌ Invalid router message:',
               message.value.toString()
            );
            // Optionally, send to error_events as BaseEvent
            const errorEvent: BaseEvent = {
               eventType: 'CoTMathServiceError',
               conversationId: userId,
               timestamp: Date.now(),
               payload: message.value.toString(), // raw string
            };
            await producer.send({
               topic: 'error_events',
               messages: [{ key: userId, value: JSON.stringify(errorEvent) }],
            });
            return;
         }

         if (!event.payload) return;

         console.log('➡️ Math problem:', event.payload);

         // Call LLM for Chain-of-Thought
         const response = await llmClient.generateText({
            prompt: event.payload,
            instructions: cotPromptTemplate,
            maxTokens: 100,
         });

         const mathExpression = response.text;
         console.log(`🧮 Math Expression: ${mathExpression}`);

         // Wrap as BaseEvent
         const mathEvent: BaseEvent = {
            eventType: 'mathBotResult',
            conversationId: userId,
            timestamp: Date.now(),
            payload: mathExpression, // only string
         };

         // Publish clean math expression
         await producer.send({
            topic: 'ToolInvocationResulted',
            messages: [{ key: userId, value: JSON.stringify(mathEvent) }],
         });
      },
   });
}

start().catch(console.error);
