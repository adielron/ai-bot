import { llmClient } from '../../llm/client.ts';
export async function calculateMath(
   expression: string,
   context?: string // <--- Receive the context here
): Promise<string> {
   try {
      console.log('🧮 LLM Math solving with context...');

      const effectiveContext = context?.trim()
         ? context
         : 'No context provided.';
      const response = await llmClient.generateText({
         model: 'gpt-4o-mini',
         prompt: `You are a technical price calculator.

AVAILABLE DATA:
${effectiveContext}

USER CALCULATION REQUEST:
"${expression}"

INSTRUCTIONS:
1. Use the AVAILABLE DATA to resolve any prices, totals, or product amounts.
2. If the context contains a product tool output with prices, use those exact numbers.
3. Do not execute code or use eval() / Function().
4. Return only the final numeric result and currency symbol.
5. If required data is missing, respond with "Cannot calculate: missing data.".
`,
         temperature: 0,
         maxTokens: 200,
      });

      return response.text.trim();
   } catch (error) {
      console.error('🧮 Math tool error:', error);
      return 'I had trouble calculating that price sum.';
   }
}
