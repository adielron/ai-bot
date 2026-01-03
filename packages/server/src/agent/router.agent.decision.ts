import { routeUserIntent } from './router.agent';
import { callLocalLLM } from '../../llm/ollama.client';
import OneShotClassification from '../../prompts/oneShotClassifier.txt';
import { type RouteDecision } from './router.agent';

export async function decideIntent(userInput: string): Promise<RouteDecision> {
   try {
      const preDecision = await Promise.race([
         callLocalLLM(userInput, OneShotClassification),
         timeout(10_000), // 10 seconds
      ]);

      const parsed = JSON.parse(preDecision);
      const normalized = normalizeRouteDecision(parsed);
      if (
         !normalized.intent ||
         !normalized.parameters ||
         typeof normalized.confidence !== 'number'
      ) {
         throw new Error('Invalid router JSON');
      }

      return normalized as RouteDecision;
   } catch {
      console.log('❌ Falling back to OpenAI router');
      return routeUserIntent(userInput);
   }
}

export function normalizeRouteDecision(raw: any): RouteDecision {
   if (!raw.intent || typeof raw.confidence !== 'number') {
      throw new Error('Invalid router output');
   }

   let parameters: Record<string, any> = {};

   switch (raw.intent) {
      case 'exchange':
         parameters.currency =
            raw.parameters?.currency ??
            raw.parameters?.currency_toConvertTo ??
            raw.parameters?.targetCurrency ??
            raw.parameters?.currencyCode ??
            null;
         break;

      case 'weather':
         parameters.city =
            raw.parameters?.city ?? raw.parameters?.location ?? null;
         break;

      case 'math':
         parameters.expression =
            raw.parameters?.expression ??
            raw.parameters?.formula ??
            raw.parameters?.calculation ??
            null;
         break;

      case 'analyzeReview':
         parameters.reviewText =
            raw.parameters?.reviewText ?? raw.parameters?.text ?? null;
         break;

      default:
         parameters = {};
   }

   return {
      intent: raw.intent,
      parameters,
      confidence: raw.confidence,
   };
}

function timeout(ms: number): Promise<never> {
   return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout exceeded')), ms)
   );
}
