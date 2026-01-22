import { Kafka } from 'kafkajs';

const kafka = new Kafka({
   clientId: 'exchange-app',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'exchange-app-group' });
const producer = kafka.producer();

// Static exchange rates (example)
const RATES: Record<string, number> = {
   USD: 1,
   EUR: 0.92,
   GBP: 0.79,
   ILS: 3.65,
};

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'intent-exchange' });

   console.log('💱 ExchangeApp is running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         console.log(message.value.toString());

         const payload = JSON.parse(message.value.toString());

         const currency =
            payload.currency ??
            payload.currencyCode ??
            payload.from ??
            payload.to;

         const rate = RATES[currency];
         const result = rate
            ? `1 USD = ${rate} ${currency}`
            : `Unknown currency: ${currency}`;

         await producer.send({
            topic: 'app-results',
            messages: [
               {
                  key: userId,
                  value: JSON.stringify({
                     type: 'exchange',
                     result,
                  }),
               },
            ],
         });
      },
   });
}

start().catch(console.error);
