import { Kafka } from 'kafkajs';
import { createInterface } from 'readline';
import { type BaseEvent } from '../shared/types';
import { randomUUID } from 'crypto';

const kafka = new Kafka({
   clientId: 'user-interface',
   brokers: ['localhost:9092'],
});

const USER_ID = randomUUID();

// Each user interface instance gets its own consumer group so they don't compete for partitions
const consumer = kafka.consumer({ groupId: `user-interface-group-${USER_ID}` });
const producer = kafka.producer();

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'bot-responses' });

   console.log('💬 Chat started. Type your message:');
   console.log('Type /exit to quit\n');

   const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You: ',
   });

   rl.prompt();

   rl.on('line', async (line) => {
      const text = line.trim();
      if (!text) return rl.prompt();
      if (text.toLowerCase() === '/exit') {
         console.log('Bye!');
         process.exit(0);
      }

      const userEvent: BaseEvent = {
         eventType: 'UserMessageReceived',
         conversationId: USER_ID,
         timestamp: Date.now(),
         payload: text,
      };

      console.log('➡️ Sending user input to orchestrator:', text);
      await producer.send({
         topic: 'user-input-event',
         messages: [{ key: USER_ID, value: JSON.stringify(userEvent) }],
      });

      rl.prompt();
   });

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (userId !== USER_ID || !message.value) return;

         const event = JSON.parse(message.value.toString()) as BaseEvent;
         if (event.eventType !== 'BotResponse') return;

         console.log(`\n🤖 ${event.payload}`);
         rl.prompt();
      },
   });
}

start().catch(console.error);
