import { Kafka } from 'kafkajs';

const kafka = new Kafka({
   clientId: 'response-aggregator',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'response-aggregator-group' });
const producer = kafka.producer();

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'app-results' });

   console.log('🧩 ResponseAggregator is running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         const { type, result } = JSON.parse(message.value.toString()) as {
            type: string;
            result: string;
         };

         // Optional formatting layer
         let finalMessage = result;

         if (type === 'weather') {
            finalMessage = `🌤️ ${result}`;
         }

         if (type === 'exchange') {
            finalMessage = `💱 ${result}`;
         }

         if (type === 'math') {
            finalMessage = `🧮 ${result}`;
         }

         await producer.send({
            topic: 'bot-responses',
            messages: [
               {
                  key: userId,
                  value: JSON.stringify({
                     message: finalMessage,
                  }),
               },
            ],
         });
      },
   });
}

start().catch(console.error);
