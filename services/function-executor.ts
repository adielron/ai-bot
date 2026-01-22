import { Kafka } from 'kafkajs';

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

         let payload;
         try {
            payload = JSON.parse(message.value.toString());
         } catch {
            console.log('error');

            // publish invalid JSON to error_events
            await producer.send({
               topic: 'error_events',
               messages: [{ key: userId, value: message.value }],
            });
            return;
         }

         console.log(payload);

         const { intent, parameters } = payload;

         let topic = '';
         switch (intent) {
            case 'weather':
               topic = 'intent-weather';
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

         await producer.send({
            topic,
            messages: [{ key: userId, value: JSON.stringify(parameters) }],
         });
      },
   });
}

start().catch(console.error);
