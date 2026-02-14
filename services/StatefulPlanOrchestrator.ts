import { Kafka } from 'kafkajs';
import { randomUUID } from 'crypto';
import { type ExecutionPlan, type BaseEvent } from '../shared/types';
import { log } from 'console';

const kafka = new Kafka({
   clientId: 'plan-orchestrator',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'plan-orchestrator-group' });
const producer = kafka.producer();

// GLOBAL STATE (shared across all messages)
const plans = new Map<string, ExecutionPlan>();

/* ---------------- Plan Builder ---------------- */

function buildPlan(conversationId: string, userInput: string): ExecutionPlan {
   const plan: ExecutionPlan = {
      planId: randomUUID(),
      conversationId,
      currentStepIndex: 0,
      status: 'running',
      steps: [
         {
            stepId: randomUUID(),
            service: 'router',
            input: userInput,
            status: 'pending',
         },
      ],
   };

   console.log('🧠 New plan created:', {
      planId: plan.planId,
      conversationId,
      steps: plan.steps,
   });

   return plan;
}

/* ---------------- Step Dispatcher ---------------- */

async function dispatchCurrentStep(plan: ExecutionPlan) {
   const step = plan.steps[plan.currentStepIndex];
   if (!step) {
      console.warn('⚠️ No step to dispatch for plan', plan.planId);
      return;
   }

   console.log('🚀 Dispatching step:', {
      planId: plan.planId,
      stepId: step.stepId,
      service: step.service,
      input: step.input,
   });

   step.status = 'in_progress';

   const event: BaseEvent = {
      eventType: 'PlanStepRequested',
      conversationId: plan.conversationId,
      timestamp: Date.now(),
      payload: step.input,
   };

   await producer.send({
      topic: 'PlanStepRequested',
      messages: [{ key: plan.conversationId, value: JSON.stringify(event) }],
   });

   console.log('📤 PlanStepRequested sent for step', step.stepId);
}

/* ---------------- Handlers ---------------- */

async function handleUserInput(event: BaseEvent) {
   console.log('📥 User input received by orchestrator:', {
      conversationId: event.conversationId,
      payload: event.payload,
   });

   const plan = buildPlan(event.conversationId, event.payload);
   plans.set(event.conversationId, plan);

   console.log('🗂️ Plan stored in memory:', plan.planId);

   await dispatchCurrentStep(plan);
}

async function handleAppResult(event: BaseEvent) {
   console.log('📥 conversation-events received:', {
      conversationId: event.conversationId,
      eventType: event.eventType,
      payload: event.payload,
   });

   const plan = plans.get(event.conversationId);
   if (!plan) {
      console.warn(
         '⚠️ No active plan found for conversation',
         event.conversationId
      );
      return;
   }

   const step = plan.steps[plan.currentStepIndex];
   if (!step) {
      console.error('❌ No current step found for plan', plan.planId);
      return;
   }

   console.log('✅ Completing step:', {
      planId: plan.planId,
      stepId: step.stepId,
      result: event.payload,
   });

   step.status = 'done';
   step.service = event.eventType;
   step.result = event.payload;

   plan.currentStepIndex++;

   if (plan.currentStepIndex >= plan.steps.length) {
      console.log('🏁 Plan completed:', plan.planId);

      plan.status = 'completed';

      const planCompletionEvent: BaseEvent = {
         eventType: step.service + 'Completed',
         conversationId: plan.conversationId,
         timestamp: Date.now(),
         payload: step.result || '',
      };

      await producer.send({
         topic: 'conversation-results',
         messages: [
            {
               key: plan.conversationId,
               value: JSON.stringify(planCompletionEvent),
            },
         ],
      });

      plans.delete(event.conversationId);

      console.log('🧹 Plan removed from memory:', plan.planId);
   } else {
      console.log('➡️ Moving to next step in plan', plan.planId);
      await dispatchCurrentStep(plan);
   }
}

//  duplication handling -------------

function handleDuplicateCommand(event: BaseEvent): boolean {
   const plan = plans.get(event.conversationId);
   if (!plan) {
      console.warn(
         '⚠️ No active plan found for conversation',
         event.conversationId
      );
      return false;
   }

   console.log('♻️ Duplicate UserMessage ignored', {
      conversationId: event.conversationId,
      planId: plan.planId,
      status: plan.status,
   });
   return true;
}

/* ---------------- Final Response ---------------- */

// async function emitFinalResponse(plan: ExecutionPlan) {
//   const finalPayload = plan.steps.map(s => s.result).join('\n');

//   console.log('📨 Emitting final response:', {
//     planId: plan.planId,
//     payload: finalPayload,
//   });

//   const event: BaseEvent = {
//     eventType: plan.steps[plan.steps.length - 1]?.service || 'BotResponseGenerated',
//     conversationId: plan.conversationId,
//     timestamp: Date.now(),
//     payload: finalPayload,
//   };

//   await producer.send({
//     topic: 'orchestrator-results',
//     messages: [
//       { key: plan.conversationId, value: JSON.stringify(event) },
//     ],
//   });

//   console.log('🤖 BotResponseGenerated sent for conversation', plan.conversationId);
// }

/* ---------------- Main ---------------- */

async function start() {
   await producer.connect();
   await consumer.connect();

   await consumer.subscribe({ topic: 'user-input-event' });
   await consumer.subscribe({ topic: 'conversation-events' });

   console.log('🧭 Plan Orchestrator is running');

   await consumer.run({
      eachMessage: async ({ message }) => {
         if (!message.value) return;

         const event = JSON.parse(message.value.toString()) as BaseEvent;

         log('message.value.toString():', message.value.toString());

         console.log('📨 Kafka event received:', {
            eventType: event.eventType,
            conversationId: event.conversationId,
         });

         if (event.eventType === 'UserMessageReceived') {
            if (handleDuplicateCommand(event)) {
               return;
            }
            await handleUserInput(event);
         }

         if (event.eventType.endsWith('Result')) {
            await handleAppResult(event);
         }
      },
   });
}

start();
