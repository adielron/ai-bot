import { Kafka } from 'kafkajs';
import { getWeather } from '../packages/server/src/tools/weather';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'weather-app',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'weather-app-group' });
const producer = kafka.producer();

async function fetchWeather(city: string): Promise<string> {
   try {
      const weatherInfo = await getWeather(city);
      return weatherInfo;
   } catch (error) {
      console.error(error);
      return `Sorry, I couldn't fetch the weather for "${city}".`;
   }
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

         let city: string;
         try {
            const event = JSON.parse(message.value.toString());
            city = JSON.parse(event.payload).city;
         } catch {
            console.error(
               '❌ Invalid weather request payload:',
               message.value.toString()
            );
            return;
         }

         const result = await fetchWeather(city);

         // Wrap result as BaseEvent
         const weatherEvent: BaseEvent = {
            eventType: 'weatherResult',
            conversationId: userId,
            timestamp: Date.now(),
            payload: result, // only string
         };

         await producer.send({
            topic: 'ToolInvocationResulted',
            messages: [{ key: userId, value: JSON.stringify(weatherEvent) }],
         });

         console.log(`🌦 Weather result sent for ${userId}: ${result}`);
      },
   });
}

start().catch(console.error);
