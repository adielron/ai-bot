import { Kafka } from 'kafkajs';
import { type ConversationHistory, type BaseEvent } from '../shared/types';

const kafka = new Kafka({
   clientId: 'memory-service',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'memory-service-group' });
const producer = kafka.producer();

const HISTORY_FILE = 'data/history.json';

// userId -> conversation history
const memory = new Map<string, ConversationHistory[]>();

/* ---------------- File Persistence ---------------- */
async function loadHistory() {
   try {
      const file = Bun.file(HISTORY_FILE);
      if (!file.exists()) return;

      const data = await file.json();
      for (const userId of Object.keys(data)) {
         memory.set(userId, data[userId]);
      }

      console.log('🧠 Memory loaded from disk');
   } catch {
      console.log('🧠 No existing history file, starting fresh');
   }
}

async function saveHistory() {
   await Bun.write(
      HISTORY_FILE,
      JSON.stringify(Object.fromEntries(memory), null, 2)
   );
}

/* ---------------- Helpers ---------------- */
function appendMessage(userId: string, message: ConversationHistory) {
   const history = memory.get(userId) ?? [];
   history.push(message);
   memory.set(userId, history);
   return history;
}

async function publishHistory(userId: string, history: ConversationHistory[]) {
   const event: BaseEvent = {
      eventType: 'ConversationHistoryUpdated',
      conversationId: userId,
      timestamp: Date.now(),
      payload: JSON.stringify(history),
   };

   await producer.send({
      topic: 'conversation-history-update',
      messages: [{ key: userId, value: JSON.stringify(event) }],
   });
}

/* ---------------- Main ---------------- */
async function start() {
   await loadHistory();

   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'user-input-events' });
   await consumer.subscribe({ topic: 'conversation-events' });
   await consumer.subscribe({ topic: 'user-control-events' });

   console.log('🧠 MemoryService is running');

   await consumer.run({
      eachMessage: async ({ topic, message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         // Parse incoming message as BaseEvent
         let event: BaseEvent;
         try {
            event = JSON.parse(message.value.toString());
         } catch (err) {
            console.error('❌ Invalid BaseEvent:', message.value.toString());
            return;
         }

         if (topic === 'user-input-events') {
            const userInput = event.payload;

            const history = appendMessage(userId, {
               role: 'user',
               content: userInput,
               timestamp: Date.now(),
            });

            await saveHistory();
            await publishHistory(userId, history);
         }

         if (topic === 'conversation-events') {
            console.log(event);

            const history = appendMessage(userId, {
               role: 'assistant',
               content: event.payload,
               timestamp: Date.now(),
            });

            await saveHistory();
            await publishHistory(userId, history);
         }

         if (topic === 'user-control-events') {
            const command = event.payload;
            console.log('command received:', command);

            if (command === '/reset') {
               memory.set(userId, []);
               await saveHistory();
               await publishHistory(userId, []);
               console.log(`♻️ History reset for user ${userId}`);
            }
         }
      },
   });
}

start().catch(console.error);
