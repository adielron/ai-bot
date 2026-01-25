import { Kafka } from 'kafkajs';
import { type BaseEvent, type CurrencyPayload } from '../shared/types';

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

         let event: any;
         try {
            event = JSON.parse(message.value.toString());
            console.log(event);
         } catch {
            // Send invalid JSON as BaseEvent
            const errorEvent: BaseEvent = {
               eventType: 'ExchangeAppError',
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

         let parsedPayload: CurrencyPayload = {};
         try {
            parsedPayload = JSON.parse(event.payload) as CurrencyPayload;
         } catch {
            console.error('❌ Invalid CurrencyPayload JSON:', event.payload);
         }

         const currency =
            parsedPayload.currency ??
            parsedPayload.currencyCode ??
            parsedPayload.from ??
            parsedPayload.to;

         const rate = currency ? RATES[currency] : undefined;
         const result = rate
            ? `1 USD = ${rate} ${currency}`
            : `Unknown currency: ${currency}`;

         event = {
            eventType: 'exchangeResult',
            conversationId: userId,
            timestamp: Date.now(),
            payload: result, // only string
         };

         await producer.send({
            topic: 'ToolInvocationResulted',
            messages: [{ key: userId, value: JSON.stringify(event) }],
         });
      },
   });
}

start().catch(console.error);
