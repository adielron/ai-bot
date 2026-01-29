import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';

const MAX_WAIT_MS = 15_000; // 15 seconds

type ConversationTimeline = {
   start?: number;
   end?: number;
   lastEventAt: number;
   lastCommand?: BaseEvent;
   retries?: number;
   events: { eventType: string; timestamp: number }[];
};

const timelines = new Map<string, ConversationTimeline>();

/* ================= WATCHDOG ================= */
setInterval(async () => {
   const now = Date.now();

   for (const [conversationId, timeline] of timelines.entries()) {
      if (!timeline.start || timeline.end) continue;
      if (!timeline.lastCommand) continue;

      if (now - (timeline.lastEventAt ?? timeline.start) > MAX_WAIT_MS) {
         timeline.retries = (timeline.retries ?? 0) + 1;
         timeline.retries++;

         if (timeline.retries! > 10) {
            console.log('❌ Plan permanently failed');
            timelines.delete(conversationId);
         }

         console.log('🔁 RETRYING PLAN STEP');
         console.log(`📊 Conversation ${conversationId}`);
         console.log(`🔄 Retry #${timeline.retries}`);

         await producer.send({
            topic: 'PlanStepRequested',
            messages: [
               {
                  key: conversationId,
                  value: JSON.stringify({
                     ...timeline.lastCommand,
                     timestamp: Date.now(), // NEW timestamp
                     retry: timeline.retries,
                  }),
               },
            ],
         });

         timeline.lastEventAt = now;
      }
   }
}, 2_000);

/* ================= KAFKA ================= */
const kafka = new Kafka({
   clientId: 'latency-calculator',
   brokers: ['localhost:9092'],
});

const producer = kafka.producer();

const consumer = kafka.consumer({
   groupId: 'latency-calculator-group-1',
});

async function start() {
   await consumer.connect();
   await producer.connect(); // 👈 ADD THIS

   await consumer.subscribe({ topic: 'PlanStepRequested' });
   await consumer.subscribe({ topic: 'bot-responses' });

   console.log('⏱️ Latency Calculator running...');

   await consumer.run({
      eachMessage: async ({ message }) => {
         if (!message.value) return;

         let event: BaseEvent;
         try {
            event = JSON.parse(message.value.toString());
         } catch {
            console.error('❌ Invalid event JSON');
            return;
         }

         const { conversationId, eventType, timestamp } = event;
         if (!conversationId || !timestamp) return;

         const timeline = timelines.get(conversationId) ?? {
            events: [],
            lastEventAt: Date.now(),
         };

         timeline.events.push({ eventType, timestamp });
         timeline.lastEventAt = Date.now();

         if (eventType === 'PlanStepRequested') {
            timeline.start = timestamp;
            timeline.lastCommand = event; // 👈 SAVE IT
            timeline.retries = 0;
         }

         if (eventType === 'FinalAnswerSynthesized') {
            timeline.end = timestamp;
         }

         timelines.set(conversationId, timeline);

         /* ===== SUCCESS PATH ===== */
         if (timeline.start && timeline.end) {
            const latency = timeline.end - timeline.start;

            console.log('==============================');
            console.log(`📊 Conversation ${conversationId}`);
            console.log(`⏱️ End-to-End Latency: ${latency} ms`);
            console.log('🧵 Timeline:');

            timeline.events
               .sort((a, b) => a.timestamp - b.timestamp)
               .forEach((e) =>
                  console.log(
                     `  ${new Date(e.timestamp).toISOString()} - ${e.eventType}`
                  )
               );

            console.log('==============================');

            timelines.delete(conversationId);
         }
      },
   });
}

start().catch(console.error);
