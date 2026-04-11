import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';
import { answerWithMathLLM } from './llmService';
import { addContextEntry } from './conversationContext';

const kafka = new Kafka({
   clientId: 'math-app',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'math-app-group' });
const producer = kafka.producer();

function safeEval(expression: string): string {
   try {
      const trimmed = expression.trim();

      // Reject empty expressions before attempting eval
      if (!trimmed || trimmed === '') {
         return 'ERROR: Empty math expression. Cannot evaluate.';
      }

      // Remove additional spaces and validate basic math characters
      const sanitized = trimmed.replace(/\s+/g, '');
      if (!/^[0-9+\-*/().]+$/.test(sanitized)) {
         return 'Invalid math expression';
      }

      // eslint-disable-next-line no-eval
      const result = eval(sanitized);
      return String(result);
   } catch (err) {
      console.error('Math evaluation error:', err);
      return 'Math error: ' + String(err).substring(0, 50);
   }
}

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'intent-math', fromBeginning: true });

   console.log('🔢 MathApp is running and listening to intent-math...');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         console.log(`\n📥 [MathApp] Received message for user: ${userId}`);

         let expression = '';
         let query = '';
         try {
            const event = JSON.parse(message.value.toString()) as BaseEvent;

            try {
               const nestedPayload = JSON.parse(event.payload);
               expression = nestedPayload.expression || event.payload;
               query = nestedPayload.query || '';
            } catch {
               expression = event.payload;
            }
         } catch (err) {
            console.error('❌ [MathApp] Critical JSON parse error:', err);
            return;
         }

         if (!expression || typeof expression !== 'string') {
            console.error(`❌ [MathApp] No valid expression found!`);
            return;
         }

         console.log(`🧮 [MathApp] Evaluating: "${expression.trim()}"`);
         const result = safeEval(expression.trim());
         console.log(`✅ [MathApp] Result: ${result}`);

         // Use LLM to provide a friendly answer with explanation
         const finalAnswer = await answerWithMathLLM(
            query || expression,
            result
         );

         // Store in conversation context for inter-tool communication
         addContextEntry(userId, 'math', query || expression, finalAnswer);

         const resultEvent: BaseEvent = {
            eventType: 'mathResult',
            conversationId: userId,
            timestamp: Date.now(),
            payload: finalAnswer,
         };

         console.log(`📤 [MathApp] Sending result to conversation-events`);
         await producer.send({
            topic: 'conversation-events',
            messages: [{ key: userId, value: JSON.stringify(resultEvent) }],
         });
      },
   });
}

start().catch(console.error);
