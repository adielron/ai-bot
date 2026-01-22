import { Kafka } from 'kafkajs';
import { getWeather } from '../packages/server/src/tools/weather';

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

         const { city } = JSON.parse(message.value.toString());

         const result = await fetchWeather(city);

         await producer.send({
            topic: 'app-results',
            messages: [
               {
                  key: userId,
                  value: JSON.stringify({
                     type: 'weather',
                     result,
                  }),
               },
            ],
         });
      },
   });
}

start().catch(console.error);
