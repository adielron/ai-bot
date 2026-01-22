// shared/types.ts
export type ConversationHistory = {
   role: 'user' | 'assistant';
   content: string;
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
