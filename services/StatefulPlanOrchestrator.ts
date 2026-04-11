import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';
import { decideToolSetWithLLM, synthesizeToolResults } from './llmService';
import { getOrCreateContext, addContextEntry } from './conversationContext';

const kafka = new Kafka({
   clientId: 'orchestrator',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'orchestrator-group' });
const producer = kafka.producer();

const requestQueue = new Map<string, string[]>();
const processingUsers = new Set<string>();
const plans = new Map<string, PlanState>();

type PlanState = {
   userInput: string;
   tools: string[];
   stepIndex: number;
   planId: string;
   toolOutputs: Array<{ tool: string; output: string }>;
};

function extractCity(query: string): string {
   const match = query.toLowerCase().match(/\b(?:in|for)\s+([a-z\s]+)$/);
   return match?.[1]?.trim() ?? query;
}

function extractCurrency(query: string): string {
   const lower = query.toLowerCase();
   const match = lower.match(/\b(usd|eur|ils|gbp|dollar|euro|shekel|pound)\b/);
   return match?.[1]?.toUpperCase() ?? 'USD';
}

function extractExpression(query: string): string {
   // Remove non-math text and extract the mathematical expression
   // Look for a pattern that starts with a digit and includes operators, parentheses
   const match = query.match(/\d+[\d+\-*/.()e\s]*/i);
   if (match && match[0].trim()) {
      return match[0].trim();
   }

   // Fallback: remove all non-math characters except digits and operators
   const cleaned = query.replace(/[^0-9+\-*/.()e\s]/gi, '').trim();
   if (cleaned && /[\d+\-*/.()e]/i.test(cleaned)) {
      return cleaned;
   }

   return query;
}

/**
 * Split multiple distinct queries
 * Detects questions separated by ? or conjunctions like "and", "also", "plus"
 * BUT doesn't split if the second query appears to be dependent on the first
 */
function splitMultipleQueries(input: string): string[] {
   // Split by question marks
   const parts = input
      .split(/\?[\s]*(?=\w)/)
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

   // If only one part, return as is
   if (parts.length <= 1) {
      return [input];
   }

   // Check for dependent queries (e.g., "multiply it times 3" after price query)
   const dependencyKeywords =
      /\b(it|them|those|that|this|multiply|times|divide|add|plus|minus|then|also)\b/i;

   // If second query starts with a dependent keyword, keep them together
   if (parts.length > 1 && dependencyKeywords.test(parts[1]!)) {
      console.log(
         `🔗 [Orchestrator] Detected dependent query. Keeping "${parts[0]}" and "${parts[1]}" together (sharing context)`
      );
      return [input]; // Keep as one query so context is shared
   }

   // Otherwise, they are independent queries - split them
   const queries = parts
      .map((q) => (q.includes('?') ? q : q + '?'))
      .filter((q) => q.trim().length > 1);

   if (queries.length > 1) {
      console.log(
         `🔀 [Orchestrator] Detected ${queries.length} independent queries: ${queries.map((q) => `"${q}"`).join(' | ')}`
      );
   }
   return queries.length > 1 ? queries : [input];
}

function createToolPayload(
   tool: string,
   userInput: string,
   requiresNumbers: boolean
) {
   if (tool === 'weather') {
      return { city: extractCity(userInput), query: userInput };
   }
   if (tool === 'exchange') {
      return { currency: extractCurrency(userInput), query: userInput };
   }
   if (tool === 'math') {
      return { expression: extractExpression(userInput), query: userInput };
   }
   return { query: userInput, requiresNumbers };
}

async function sendBotResponse(conversationId: string, answer: string) {
   const botEvent: BaseEvent = {
      eventType: 'BotResponse',
      conversationId,
      timestamp: Date.now(),
      payload: answer,
   };

   await producer.send({
      topic: 'bot-responses',
      messages: [{ key: conversationId, value: JSON.stringify(botEvent) }],
   });
}

async function processUserInput(conversationId: string, userInput: string) {
   const planId = `${conversationId}-${Date.now()}`;
   console.log(`🧠 [Plan ${planId}] received user input:`, userInput);

   const tools = await decideToolSetWithLLM(userInput);
   console.log(`🔎 [Plan ${planId}] tool set selected by LLM:`, tools);

   // Check if request was blocked due to safety concerns
   if (tools.includes('blocked')) {
      const answer = `I cannot assist with that request. It may involve illegal, harmful, or unsafe content. Please ask me something else.`;
      await sendBotResponse(conversationId, answer);
      return;
   }

   if (tools.length === 0 || tools.includes('chat')) {
      const answer = `I am a simple assistant. You asked: "${userInput}"`;
      await sendBotResponse(conversationId, answer);
      return;
   }

   const planState: PlanState = {
      userInput,
      tools,
      stepIndex: 0,
      planId,
      toolOutputs: [],
   };
   plans.set(conversationId, planState);

   await dispatchNextTool(conversationId, planState);
}

async function dispatchNextTool(conversationId: string, planState: PlanState) {
   const tool = planState.tools[planState.stepIndex];
   if (!tool) {
      console.warn(
         `⚠️ [Plan ${planState.planId}] no tool found for step ${planState.stepIndex}`
      );
      await sendBotResponse(
         conversationId,
         'Sorry, I could not decide which tool to run.'
      );
      plans.delete(conversationId);
      processingUsers.delete(conversationId);
      return;
   }

   const requiresNumbers = tool === 'rag' && planState.tools.includes('math');
   const payload = createToolPayload(
      tool,
      planState.userInput,
      requiresNumbers
   );
   const topic =
      tool === 'weather'
         ? 'intent-weather'
         : tool === 'exchange'
           ? 'intent-exchange'
           : tool === 'math'
             ? 'intent-math'
             : 'intent-rag';

   const toolEvent: BaseEvent = {
      eventType: 'ToolInvocationRequested',
      conversationId,
      timestamp: Date.now(),
      payload: JSON.stringify(payload),
   };

   console.log(
      `📪 [Plan ${planState.planId}] dispatching tool '${tool}' to topic ${topic}`
   );
   await producer.send({
      topic,
      messages: [{ key: conversationId, value: JSON.stringify(toolEvent) }],
   });

   processingUsers.add(conversationId);
   console.log(
      `✅ [Plan ${planState.planId}] dispatched tool request for ${tool}`
   );
}

async function queueUserInput(conversationId: string, userInput: string) {
   // First, check if there are multiple distinct queries
   const queries = splitMultipleQueries(userInput);

   // If multiple queries, queue each one separately
   if (queries.length > 1) {
      console.log(
         `📋 [Orchestrator] Queueing ${queries.length} separate queries for conversation ${conversationId}`
      );
      for (const query of queries) {
         const queue = requestQueue.get(conversationId) ?? [];
         queue.push(query);
         requestQueue.set(conversationId, queue);
      }
   } else {
      // Single query, queue normally
      const queue = requestQueue.get(conversationId) ?? [];
      queue.push(userInput);
      requestQueue.set(conversationId, queue);
   }

   if (!processingUsers.has(conversationId)) {
      await startNextRequest(conversationId);
   }
}

async function startNextRequest(conversationId: string) {
   const queue = requestQueue.get(conversationId) ?? [];
   if (queue.length === 0) {
      processingUsers.delete(conversationId);
      requestQueue.delete(conversationId);
      return;
   }

   const nextInput = queue.shift();
   if (!nextInput) {
      processingUsers.delete(conversationId);
      requestQueue.delete(conversationId);
      return;
   }

   requestQueue.set(conversationId, queue);
   await processUserInput(conversationId, nextInput);
}

function parseToolResponse(payload: string) {
   try {
      const parsed = JSON.parse(payload) as {
         answer?: string;
         metadata?: { numbers?: number[] };
      };
      return {
         answer: typeof parsed.answer === 'string' ? parsed.answer : payload,
         numbers: Array.isArray(parsed.metadata?.numbers)
            ? parsed.metadata?.numbers
            : undefined,
      };
   } catch {
      return { answer: payload, numbers: undefined };
   }
}

function buildMathExpression(numbers: number[]): string {
   if (!numbers || numbers.length === 0) {
      return '';
   }
   return numbers.map((value) => value.toString()).join(' + ');
}

async function handleToolResult(event: BaseEvent) {
   const planState = plans.get(event.conversationId);
   if (!planState) {
      console.warn(
         `⚠️ [Orchestrator] No plan found for conversation ${event.conversationId}`
      );
      return;
   }

   const { answer, numbers } = parseToolResponse(event.payload);
   const currentTool = planState.tools[planState.stepIndex];

   console.log(`📥 [Orchestrator] Tool result received from ${currentTool}`);
   console.log(`   Answer: ${answer}`);
   console.log(
      `   Numbers found: ${numbers ? `[${numbers.join(', ')}]` : 'none'}`
   );

   // Store tool output in plan and conversation context
   planState.toolOutputs.push({ tool: currentTool!, output: answer });
   addContextEntry(
      event.conversationId,
      currentTool!,
      planState.userInput,
      answer,
      numbers
   );

   // Check if we need to chain to the next tool (e.g., RAG → Math)
   const nextTool = planState.tools[planState.stepIndex + 1];

   // DEBUG: Log chaining decision details
   console.log(
      `🔍 [Plan ${planState.planId}] Chaining check: currentTool=${currentTool}, nextTool=${nextTool}, hasNumbers=${!!numbers}, numberCount=${numbers?.length ?? 0}`
   );

   if (
      currentTool === 'rag' &&
      nextTool === 'math' &&
      numbers &&
      numbers.length > 0
   ) {
      console.log(
         `⛓️  [Plan ${planState.planId}] Chaining RAG → MATH with ${numbers.length} numbers.`
      );

      // Update plan to advance to next step
      planState.stepIndex += 1;
      plans.set(event.conversationId, planState);

      // Build math expression from numbers and dispatch math tool
      const expression = buildMathExpression(numbers);

      if (!expression || expression.trim() === '') {
         console.error(
            `❌ [Plan ${planState.planId}] ERROR: Math expression is empty! Numbers: ${JSON.stringify(numbers)}`
         );

         // If math fails, synthesize whatever we have so far or return RAG answer
         const finalAnswer =
            planState.toolOutputs.length > 1
               ? await synthesizeToolResults(
                    planState.userInput,
                    planState.toolOutputs
                 )
               : answer;

         await sendBotResponse(event.conversationId, finalAnswer);
         plans.delete(event.conversationId);
         processingUsers.delete(event.conversationId);
         await startNextRequest(event.conversationId);
         return;
      }

      const mathEvent: BaseEvent = {
         eventType: 'ToolInvocationRequested',
         conversationId: event.conversationId,
         timestamp: Date.now(),
         payload: JSON.stringify({ expression }),
      };

      console.log(
         `📪 [Plan ${planState.planId}] Dispatching math with expression: "${expression}"`
      );
      await producer.send({
         topic: 'intent-math',
         messages: [
            { key: event.conversationId, value: JSON.stringify(mathEvent) },
         ],
      });
      return;
   }

   // If RAG was supposed to chain to Math but didn't (no numbers), still remove Math from plan
   if (
      currentTool === 'rag' &&
      nextTool === 'math' &&
      (!numbers || numbers.length === 0)
   ) {
      console.log(
         `⚠️  [Plan ${planState.planId}] RAG did not extract numbers. Skipping math and returning RAG result.`
      );
      planState.tools.splice(planState.stepIndex + 1, 1); // Remove math from plan since it can't execute
      plans.set(event.conversationId, planState);
   }

   // If no more tools to chain, plan is complete
   console.log(
      `✅ [Plan ${planState.planId}] All tools completed. Processing final answer.`
   );

   // If multiple tools were used, synthesize the results; otherwise return the single tool's answer
   let finalAnswer: string;
   if (planState.toolOutputs.length > 1) {
      console.log(
         `🎼 [Plan ${planState.planId}] Synthesizing outputs from ${planState.toolOutputs.length} tools`
      );
      finalAnswer = await synthesizeToolResults(
         planState.userInput,
         planState.toolOutputs
      );
   } else {
      finalAnswer = answer;
   }

   await sendBotResponse(event.conversationId, finalAnswer);

   // Clean up state
   plans.delete(event.conversationId);
   processingUsers.delete(event.conversationId);
   await startNextRequest(event.conversationId);
}

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'user-input-event' });
   await consumer.subscribe({ topic: 'conversation-events' });

   console.log('🧭 Orchestrator is running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         if (!message.value) return;

         const event = JSON.parse(message.value.toString()) as BaseEvent;

         if (event.eventType === 'UserMessageReceived') {
            await queueUserInput(event.conversationId, event.payload);
            return;
         }

         if (event.eventType.endsWith('Result')) {
            await handleToolResult(event);
            return;
         }
      },
   });
}

start().catch(console.error);
