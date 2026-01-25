import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'response-aggregator',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'response-aggregator-group' });

const producer = kafka.producer();
// Global memory to store intermediate tool results for each conversation
const planResults = new Map<string, string[]>();

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'conversation-results' });

   console.log('🧩 ResponseAggregator is running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         // Initialize array if first message
         if (!planResults.has(userId)) {
            planResults.set(userId, []);
         }

         let event: BaseEvent;
         try {
            event = JSON.parse(message.value.toString()) as BaseEvent;
         } catch {
            console.error(
               '❌ Invalid BaseEvent in app-results:',
               message.value.toString()
            );
            return;
         }

         let payload: string;
         let type: string;

         try {
            payload = event.payload;
            type = event.eventType;
         } catch {
            console.error('❌ Invalid payload in BaseEvent:', event.payload);
            return;
         }

         planResults.get(userId)?.push(payload);

         // Optional formatting layer
         let finalMessage = payload;

         console.log(type, 'type is');

         if (type === 'weatherResult') {
            finalMessage = `🌤️ ${payload}`;
         } else if (type === 'exchangeResult') {
            finalMessage = `💱 ${payload}`;
         } else if (type === 'mathResult' || type === 'mathBotResult') {
            finalMessage = `🧮 ${payload}`;
         } else {
            finalMessage = `🤖 ${payload}`;
         }

         if (event.eventType.endsWith('Completed')) {
            const serviceName = event.eventType.replace('Completed', '');
            const accumulatedResults = planResults.get(userId) || [];

            // Build final synthesis request
            const synthesisEvent: BaseEvent = {
               eventType: 'SynthesizeFinalAnswerRequested',
               conversationId: userId,
               timestamp: Date.now(),
               payload: accumulatedResults.join('\n'),
            };

            await producer.send({
               topic: 'user-commands',
               messages: [
                  { key: userId, value: JSON.stringify(synthesisEvent) },
               ],
            });

            console.log(
               `📝 SynthesizeFinalAnswerRequested sent for conversation ${userId}`
            );

            // Clear intermediate results
            planResults.delete(userId);
         }
      },
   });
}

start().catch(console.error);
