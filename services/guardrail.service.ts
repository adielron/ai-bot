import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'guardrail-service',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'guardrail-service-group' });
const producer = kafka.producer();

// List of unsafe topics/keywords
const unsafePatterns = [
   /politics/i,
   /president/i,
   /malware/i,
   /virus/i,
   /hack/i,
   /exploit/i,
   /delete\s+data/i,
   /kill/i,
];

function isUnsafe(input: string): boolean {
   return unsafePatterns.some((regex) => regex.test(input));
}

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'user-input-events' });

   console.log('🛡️ Guardrail Service running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         // Parse incoming user input as BaseEvent
         let event: BaseEvent;
         try {
            event = JSON.parse(message.value.toString());
         } catch {
            console.error(
               '❌ Invalid BaseEvent received:',
               message.value.toString()
            );
            return;
         }

         const userInput = event.payload;
         if (!userInput) return;

         console.log(`Processing user input: ${userInput}`);

         if (isUnsafe(userInput)) {
            console.log(
               `⚠️ Guardrail triggered for user ${userId}: ${userInput}`
            );

            // Publish as a BaseEvent
            const guardrailEvent: BaseEvent = {
               eventType: 'GuardrailViolation',
               conversationId: userId,
               timestamp: Date.now(),
               payload: userInput,
            };

            await producer.send({
               topic: 'guardrail_violation_events',
               messages: [
                  { key: userId, value: JSON.stringify(guardrailEvent) },
               ],
            });
         }
      },
   });
}

start().catch((err) => {
   console.error('Guardrail Service failed:', err);
   process.exit(1);
});
