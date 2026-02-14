import { Kafka } from 'kafkajs';
import readline from 'readline';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'user-interface',
   brokers: ['localhost:9092'], // make sure this matches your setup
});

const consumer = kafka.consumer({ groupId: 'user-interface-group' });
const producer = kafka.producer();

const USER_ID = 'user-1';

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'bot-responses' });
   await consumer.subscribe({ topic: 'guardrail_violation_events' });

   console.log('💬 Chat started. Type your message:');
   console.log('Type /reset to clear conversation history\n');

   // ----------------- Setup readline -----------------
   const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You: ',
   });

   rl.prompt();

   let guardrailFired = false; // tracks only the current input

   rl.on('line', async (line) => {
      const userInput = line.trim();
      if (!userInput) return rl.prompt();

      guardrailFired = false;

      if (userInput.toLowerCase() === '/reset') {
         console.log('Reset command issued by user.');

         const resetEvent: BaseEvent = {
            eventType: 'UserControlCommand',
            conversationId: USER_ID,
            timestamp: Date.now(),
            payload: '/reset',
         };

         await producer.send({
            topic: 'user-control-events',
            messages: [{ key: USER_ID, value: JSON.stringify(resetEvent) }],
         });
         rl.prompt();
         return;
      }

      const userEvent: BaseEvent = {
         eventType: 'UserMessageReceived',
         conversationId: USER_ID,
         timestamp: Date.now(),
         payload: userInput,
      };

      await producer.send({
         topic: 'user-input-event',
         messages: [{ key: USER_ID, value: JSON.stringify(userEvent) }],
      });
   });

   // ----------------- Kafka consumer -----------------

   await consumer.run({
      eachMessage: async ({ topic, message }) => {
         const userId = message.key?.toString();
         if (userId !== USER_ID || !message.value) return;

         if (topic === 'guardrail_violation_events') {
            guardrailFired = true;
            console.log(
               `\n🤖 I cannot process this request: due to safety protocols.`
            );
            rl.prompt();
            return;
         }

         if (topic === 'bot-responses') {
            if (guardrailFired) {
               // Ignore normal bot response if guardrail fired
               return;
            }

            const parsed = JSON.parse(message.value.toString()) as BaseEvent;

            console.log(`\n ${parsed.payload}`);
            rl.prompt();
         }
      },
   });
}

start().catch(console.error);
