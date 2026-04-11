import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';
import { answerWithWeatherLLM } from './llmService';
import { addContextEntry } from './conversationContext';

const kafka = new Kafka({
   clientId: 'weather-app',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'weather-app-group' });
const producer = kafka.producer();

function formatWeather(city: string) {
   const normalized = city.trim().toLowerCase();
   if (normalized.includes('tel aviv')) {
      return 'Tel Aviv: sunny, 28°C, light breeze.';
   }
   if (normalized.includes('london')) {
      return 'London: cloudy, 14°C, chance of rain.';
   }
   if (normalized.includes('new york')) {
      return 'New York: partly cloudy, 22°C, mild.';
   }
   return `Weather for ${city}: clear, 25°C.`;
}

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'intent-weather' });

   console.log('🌦 WeatherApp is running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         let event: BaseEvent;
         try {
            event = JSON.parse(message.value.toString()) as BaseEvent;
         } catch {
            return;
         }

         const payload = JSON.parse(event.payload || '{}');
         const city =
            typeof payload.city === 'string' ? payload.city : 'your location';
         const query =
            typeof payload.query === 'string'
               ? payload.query
               : `What is the weather in ${city}?`;
         const weatherData = formatWeather(city);

         // Use LLM to provide a friendly weather answer
         const finalAnswer = await answerWithWeatherLLM(query, weatherData);

         // Store in conversation context for inter-tool communication
         addContextEntry(userId, 'weather', query, finalAnswer);

         const weatherEvent: BaseEvent = {
            eventType: 'weatherResult',
            conversationId: userId,
            timestamp: Date.now(),
            payload: finalAnswer,
         };

         await producer.send({
            topic: 'conversation-events',
            messages: [{ key: userId, value: JSON.stringify(weatherEvent) }],
         });
      },
   });
}

start().catch(console.error);
