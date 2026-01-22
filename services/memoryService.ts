import { Kafka } from 'kafkajs';
import { type ConversationHistory } from '../shared/types';

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
   await producer.send({
      topic: 'conversation-history-update',
      messages: [
         {
            key: userId,
            value: JSON.stringify(history),
         },
      ],
   });
}

/* ---------------- Main ---------------- */

async function start() {
   await loadHistory();

   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'user-input-events' });
   await consumer.subscribe({ topic: 'app-results' });
   await consumer.subscribe({ topic: 'user-control-events' });

   console.log('🧠 MemoryService is running');

   await consumer.run({
      eachMessage: async ({ topic, message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         /* User input */
         if (topic === 'user-input-events') {
            const userInput = message.value.toString();

            const history = appendMessage(userId, {
               role: 'user',
               content: userInput,
            });

            await saveHistory();
            await publishHistory(userId, history);
         }

         /* App result */
         if (topic === 'app-results') {
            const { result } = JSON.parse(message.value.toString());

            const history = appendMessage(userId, {
               role: 'assistant',
               content: result,
            });

            await saveHistory();
            await publishHistory(userId, history);
         }

         /* Reset command */
         if (topic === 'user-control-events') {
            const raw = message.value.toString();
            console.log('command received:', raw);

            try {
               const parsed = JSON.parse(raw);
               console.log('parsed command value:', parsed.command);

               if (parsed.command === 'reset') {
                  memory.set(userId, []);
                  await saveHistory();
                  await publishHistory(userId, []);
                  console.log(`♻️ History reset for user ${userId}`);
               }
            } catch (err) {
               console.error('Invalid control message:', raw);
            }
         }
      },
   });
}

start().catch(console.error);
