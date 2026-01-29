import { routeUserIntent } from './router.agent';
import { type RouteDecision, type ToolStep } from './router.agent';

/**
 * Main entry point: Tries local Ollama first, falls back to OpenAI
 */
export async function decideIntent(userInput: string): Promise<RouteDecision> {
   // 1. Await the response from the LLM agent
   const rawDecision = await routeUserIntent(userInput);

   // 2. Pass the resolved data (not the Promise) to normalizePlan
   return normalizePlan(rawDecision);
}

/**
 * Ensures the LLM output (local or cloud) matches our new Array-based Plan structure
 */
export function normalizePlan(raw: any): RouteDecision {
   // 1. Ensure 'plan' exists and is an array
   if (!raw.plan || !Array.isArray(raw.plan)) {
      throw new Error('Invalid router output: Missing plan array');
   }

   // 2. Map and clean each step in the plan
   const plan: ToolStep[] = raw.plan.map((step: any) => {
      return {
         tool: step.tool || 'chat',
         parameters: step.parameters || {},
      };
   });

   return {
      plan,
      final_answer_synthesis_required: !!raw.final_answer_synthesis_required,
   };
}
