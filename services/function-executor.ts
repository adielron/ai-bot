import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'function-router',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'function-router-group' });
const producer = kafka.producer();

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'function_execution_requests' });
   console.log('🛠️ Function Router running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         let event: BaseEvent;
         try {
            event = JSON.parse(message.value.toString()) as BaseEvent;
         } catch {
            console.error('❌ Invalid BaseEvent JSON');

            const errorEvent: BaseEvent = {
               eventType: 'FunctionRouterError',
               conversationId: userId,
               timestamp: Date.now(),
               payload: message.value.toString(),
            };

            await producer.send({
               topic: 'error_events',
               messages: [{ key: userId, value: JSON.stringify(errorEvent) }],
            });
            return;
         }

         // Parse the actual payload
         let payload: string;
         try {
            payload = event.payload;
         } catch {
            console.error('❌ Invalid payload JSON');

            const errorEvent: BaseEvent = {
               eventType: 'FunctionRouterError',
               conversationId: userId,
               timestamp: Date.now(),
               payload: event.payload,
            };

            await producer.send({
               topic: 'error_events',
               messages: [{ key: userId, value: JSON.stringify(errorEvent) }],
            });
            return;
         }

         console.log(payload);

         const { intent, parameters } = JSON.parse(payload);
         let topic = '';

         switch (intent) {
            case 'weather':
               topic = 'intent-weather';
               break;
            case 'mathBot':
               topic = 'intent-math-bot';
               break;
            case 'math':
               topic = 'intent-math';
               break;

            case 'exchange':
               topic = 'intent-exchange';
               break;
            case 'chat':
               topic = 'intent-general-chat';
               break;
            default:
               topic = 'error_events';
         }

         const routedEvent: BaseEvent = {
            eventType: 'ToolInvocationRequested',
            conversationId: userId,
            timestamp: Date.now(),
            payload: JSON.stringify(parameters),
         };

         await producer.send({
            topic,
            messages: [{ key: userId, value: JSON.stringify(routedEvent) }],
         });
      },
   });
}

start().catch(console.error);
