import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'math-app',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'math-app-group' });
const producer = kafka.producer();

function safeEval(expression: string): string {
   try {
      // Allow only numbers, parentheses, and math operators
      if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
         return 'Invalid math expression';
      }

      // eslint-disable-next-line no-eval
      const result = eval(expression);
      return String(result);
   } catch {
      return 'Math error';
   }
}

async function start() {
   await producer.connect();
   await consumer.connect();

   // Subscribe to both original math intent and CoT expression events
   await consumer.subscribe({ topic: 'intent-math' });
   await consumer.subscribe({ topic: 'cot_math_expression_events' });

   console.log('🔢 MathApp is running');

   await consumer.run({
      eachMessage: async ({ message, topic }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         let event: BaseEvent;

         try {
            event = JSON.parse(message.value.toString()) as BaseEvent;
         } catch {
            console.error(
               '❌ Invalid BaseEvent payload:',
               message.value.toString()
            );
            return;
         }

         let expression: string | undefined;

         // Determine expression based on topic
         if (topic === 'intent-math') {
            // Router / function router sends expression inside payload JSON
            try {
               const payload = JSON.parse(event.payload);
               expression = payload.expression ?? '';
            } catch {
               console.error(
                  '❌ Invalid payload for intent-math:',
                  event.payload
               );
               return;
            }
         } else if (topic === 'cot_math_expression_events') {
            // CoT Math service sends expression as payload string
            expression = event.payload;
         }

         if (!expression) return;

         const result = safeEval(expression);

         // Publish result as BaseEvent
         const resultEvent: BaseEvent = {
            eventType: 'mathResult',
            conversationId: userId,
            timestamp: Date.now(),
            payload: result, // only string
         };

         await producer.send({
            topic: 'ToolInvocationResulted',
            messages: [{ key: userId, value: JSON.stringify(resultEvent) }],
         });

         console.log(`🧮 Math result for ${userId}: ${result}`);
      },
   });
}

start().catch(console.error);
