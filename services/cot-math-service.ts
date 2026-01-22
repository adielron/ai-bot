import { Kafka } from 'kafkajs';
import { llmClient } from '../packages/server/llm/client';
import cotPromptTemplate from '../prompts/cotPromptTemplate.txt';

const kafka = new Kafka({
   clientId: 'cot-math-service',
   brokers: ['localhost:9092'],
});
const consumer = kafka.consumer({ groupId: 'cot-math-service-group' });
const producer = kafka.producer();

async function start() {
   await consumer.connect();
   await producer.connect();
   await consumer.subscribe({ topic: 'router_decision_events' });

   console.log('🧮 CoT Math Service running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         const routerMsg = JSON.parse(message.value.toString());
         if (routerMsg.intent !== 'math' || !routerMsg.parameters?.expression)
            return;

         const problemText = routerMsg;

         console.log(problemText);

         // Call LLM for Chain-of-Thought
         const response = await llmClient.generateText({
            prompt: problemText.parameters.expression,
            instructions: cotPromptTemplate,
            maxTokens: 100,
         });

         const mathExpression = response.text;

         console.log(`🧮 Math Expression: ${mathExpression}`);
         // Publish clean math expression
         await producer.send({
            topic: 'cot_math_expression_events',
            messages: [{ key: userId, value: mathExpression }],
         });
      },
   });
}

start().catch(console.error);
