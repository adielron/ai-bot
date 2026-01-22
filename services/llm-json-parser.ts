import { Kafka } from 'kafkajs';

// Initialize Kafka client
const kafka = new Kafka({
   clientId: 'llm-json-parser',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'llm-json-parser-group' });
const producer = kafka.producer();

async function start() {
   await consumer.connect();
   await producer.connect();
   await consumer.subscribe({ topic: 'llm_response_events' });

   console.log('🧩 LLM JSON Parser running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         const rawText = message.value.toString();
         let parsed: any;

         try {
            parsed = JSON.parse(rawText);
         } catch (err) {
            console.error('❌ Invalid JSON from LLM:', rawText);

            await producer.send({
               topic: 'error_events',
               messages: [
                  {
                     key: userId,
                     value: JSON.stringify({
                        error: 'Invalid JSON',
                        raw: rawText,
                     }),
                  },
               ],
            });
            return;
         }

         // Validate required fields
         console.log(parsed);

         if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'intent' in parsed &&
            'parameters' in parsed &&
            'confidence' in parsed
         ) {
            // Publish to function_execution_requests
            await producer.send({
               topic: 'function_execution_requests',
               messages: [{ key: userId, value: JSON.stringify(parsed) }],
            });
         } else {
            console.error('❌ JSON missing required fields:', parsed);

            await producer.send({
               topic: 'error_events',
               messages: [
                  {
                     key: userId,
                     value: JSON.stringify({
                        error: 'Missing fields',
                        raw: parsed,
                     }),
                  },
               ],
            });
         }
      },
   });
}

start().catch(console.error);
