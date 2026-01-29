import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';

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

         // Parse incoming BaseEvent
         const event = JSON.parse(message.value.toString()) as BaseEvent;

         console.log(event);

         // Parse payload (raw LLM JSON string)
         let parsedPayload: any;
         try {
            parsedPayload = JSON.parse(event.payload);
         } catch (err) {
            console.error('❌ Invalid JSON from LLM:', event.payload);

            const errorEvent: BaseEvent = {
               eventType: 'LLMJSONParseError',
               conversationId: userId,
               timestamp: Date.now(),
               payload: event.payload, // <-- now just the raw string
            };

            await producer.send({
               topic: 'error_events',
               messages: [{ key: userId, value: JSON.stringify(errorEvent) }],
            });
            return;
         }

         // Validate required fields
         if (
            typeof parsedPayload === 'object' &&
            parsedPayload !== null &&
            'intent' in parsedPayload &&
            'parameters' in parsedPayload &&
            'confidence' in parsedPayload
         ) {
            // Wrap as BaseEvent for function_execution_requests
            const funcExecEvent: BaseEvent = {
               eventType: 'FunctionExecutionRequested',
               conversationId: userId,
               timestamp: Date.now(),
               payload: JSON.stringify(parsedPayload),
            };

            await producer.send({
               topic: 'function_execution_requests',
               messages: [
                  { key: userId, value: JSON.stringify(funcExecEvent) },
               ],
            });
         } else {
            console.error('❌ JSON missing required fields:', parsedPayload);

            const errorEvent: BaseEvent = {
               eventType: 'LLMJSONParseError',
               conversationId: userId,
               timestamp: Date.now(),
               payload: message.value.toString(), // <-- just the raw original value
            };

            await producer.send({
               topic: 'error_events',
               messages: [{ key: userId, value: JSON.stringify(errorEvent) }],
            });
         }
      },
   });
}

start().catch(console.error);
