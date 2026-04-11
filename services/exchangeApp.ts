import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';
import { answerWithExchangeLLM } from './llmService';
import { addContextEntry } from './conversationContext';

const kafka = new Kafka({
   clientId: 'exchange-app',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'exchange-app-group' });
const producer = kafka.producer();

const RATES: Record<string, number> = {
   USD: 1,
   EUR: 0.92,
   GBP: 0.79,
   ILS: 3.65,
};

function parseCurrency(payload: string): string {
   try {
      const parsed = JSON.parse(payload);
      return (
         parsed.currency ||
         parsed.currencyCode ||
         parsed.from ||
         parsed.to ||
         'USD'
      );
   } catch {
      return 'USD';
   }
}

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'intent-exchange' });

   console.log('💱 ExchangeApp is running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         const event = JSON.parse(message.value.toString()) as BaseEvent;
         const payload = JSON.parse(event.payload || '{}');
         const currency = (payload.currency || 'USD').toUpperCase();
         const query =
            typeof payload.query === 'string'
               ? payload.query
               : `What is the exchange rate for ${currency}?`;
         const rate = RATES[currency];
         const exchangeData = rate
            ? `1 USD = ${rate} ${currency}`
            : `Unknown currency: ${currency}`;

         // Use LLM to provide friendly exchange rate answer
         const finalAnswer = await answerWithExchangeLLM(query, exchangeData);

         // Store in conversation context for inter-tool communication
         addContextEntry(userId, 'exchange', query, finalAnswer);

         const exchangeEvent: BaseEvent = {
            eventType: 'exchangeResult',
            conversationId: userId,
            timestamp: Date.now(),
            payload: finalAnswer,
         };

         await producer.send({
            topic: 'conversation-events',
            messages: [{ key: userId, value: JSON.stringify(exchangeEvent) }],
         });
      },
   });
}

start().catch(console.error);
