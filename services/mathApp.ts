import { Kafka } from 'kafkajs';

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

         if (topic === 'intent-math') {
            console.log(topic, message.value.toString());
         } else if (topic === 'cot_math_expression_events') {
            console.log(topic, message.value.toString());
         }

         // Determine which topic the message came from
         let expression: string | undefined;

         try {
            const payload = JSON.parse(message.value.toString());
            if ('expression' in payload) {
               // From router intent-math
               expression = payload.expression;
            } else if (typeof payload === 'string') {
               // From CoT service, raw string expression
               expression = payload;
            }
         } catch {
            console.error('❌ Invalid math payload:', message.value.toString());
            return;
         }

         if (!expression) return;

         const result = safeEval(expression);

         await producer.send({
            topic: 'app-results',
            messages: [
               {
                  key: userId,
                  value: JSON.stringify({
                     type: 'math',
                     result,
                  }),
               },
            ],
         });
      },
   });
}

start().catch(console.error);
