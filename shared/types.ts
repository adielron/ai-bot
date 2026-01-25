// shared/types.ts
export type ConversationHistory = {
   role: 'user' | 'assistant';
   content: string;
   timestamp: number; // Date.now()
};

export type IntentDetectionResult =
   | { intent: 'math'; parameters: { expression: string }; confidence: number }
   | { intent: 'weather'; parameters: { city: string }; confidence: number }
   | {
        intent: 'exchange';
        parameters: { currency: string };
        confidence: number;
     }
   | {
        intent: 'analyzeReview';
        parameters: { reviewText: string };
        confidence: number;
     }
   | { intent: 'chat'; parameters: {}; confidence: number };

// shared/types.ts
export type BaseEvent = {
   eventType: string; // e.g. 'MathExpressionGenerated'
   conversationId: string; // user/session id
   timestamp: number; // milliseconds
   payload: string; // service-specific data
};

export type PlanStepStatus = 'pending' | 'in_progress' | 'done';

export type PlanStep = {
   stepId: string;
   service: string; // start simple
   input: string;
   status: PlanStepStatus;
   result?: string;
};

export type ExecutionPlan = {
   planId: string;
   conversationId: string;
   currentStepIndex: number;
   status: 'running' | 'completed';
   steps: PlanStep[];
};

export type CurrencyPayload = {
   currency?: string;
   currencyCode?: string;
   from?: string;
   to?: string;
};
