import { Kafka } from 'kafkajs';

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

   // Choose which topic(s) to scan
   await consumer.subscribe({ topic: 'user-input-events' });
   // await consumer.subscribe({ topic: 'llm_prompt_requests' });

   console.log('🛡️ Guardrail Service running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         const userInput = message.value?.toString();
         if (!userId || !userInput) return;

         console.log(`Processing user input: ${userInput}`);

         if (isUnsafe(userInput)) {
            console.log(
               `⚠️ Guardrail triggered for user ${userId}: ${userInput}`
            );

            // Publish to guardrail_violation_events
            await producer.send({
               topic: 'guardrail_violation_events',
               messages: [{ key: userId, value: userInput }],
            });
         }
      },
   });
}

start().catch((err) => {
   console.error('Guardrail Service failed:', err);
   process.exit(1);
});
