// synthesis-worker.ts
import { Kafka } from 'kafkajs';
import { llmClient } from '../packages/server/llm/client';
import { type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'synthesis-worker',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'synthesis-worker-group' });
const producer = kafka.producer();

// The orchestration prompt template
function ORCHESTRATION_SYNTHESIS_PROMPT(results: string[]): string {
   return `

${results.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Please combine them into a clear, concise answer for the user.
`;
}

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'user-commands' });

   console.log('🧩 Synthesis Worker is running...');

   await consumer.run({
      eachMessage: async ({ message }) => {
         if (!message.value) return;

         const userId = message.key?.toString();
         if (!userId) return;

         let event: BaseEvent;
         try {
            event = JSON.parse(message.value.toString()) as BaseEvent;
         } catch {
            console.error('❌ Invalid BaseEvent:', message.value.toString());
            return;
         }

         if (event.eventType !== 'SynthesizeFinalAnswerRequested') return;

         console.log('📥 SynthesizeFinalAnswerRequested received for', userId);

         const intermediateResults = event.payload.split('\n');

         // Call OpenAI to synthesize
         let synthesizedAnswer: string;
         try {
            const Completed = await llmClient.generateText({
               instructions:
                  'You are an assistant that synthesizes multiple tool results into a single coherent response.The following are the results collected from the tools:',
               prompt: ORCHESTRATION_SYNTHESIS_PROMPT(intermediateResults),
               maxTokens: 500,
            });

            synthesizedAnswer = Completed.text.trim();
         } catch (err) {
            console.error('❌ Error calling OpenAI:', err);
            synthesizedAnswer = intermediateResults.join('\n'); // fallback
         }

         console.log(
            '📝 Synthesized final answer for',
            userId,
            ':',
            synthesizedAnswer
         );

         // Send FinalAnswerSynthesized event to conversation-events
         const finalEvent: BaseEvent = {
            eventType: 'FinalAnswerSynthesized',
            conversationId: userId,
            timestamp: Date.now(),
            payload: synthesizedAnswer,
         };

         await producer.send({
            topic: 'bot-responses',
            messages: [{ key: userId, value: JSON.stringify(finalEvent) }],
         });

         console.log('📤 FinalAnswerSynthesized sent for', userId);
      },
   });
}

start().catch(console.error);
