import { type RouteDecision, type ToolStep } from '../src/agent/router.agent';
import { getWeather } from '../src/tools/weather';
import { calculateMath } from '../src/tools/math';
import { getExchangeRate } from '../src/tools/exchange';
import { analyzeReview } from '../src/tools/analyzeReview';
import { analyzeWithPython } from '../llm/bert.python';
import { chatService } from './chat.service';

import { llmClient } from '../llm/client.ts';

// Import your new RAG function
import { getProductInformation } from '../src/tools/productInformation';

export async function executeDecision(
   decision: RouteDecision,
   userInput: string,
   conversationId: string
): Promise<string> {
   const toolResults: string[] = [];

   const planStart = performance.now();
   // 1. Iterate through the plan
   for (const step of decision.plan) {
      const result = await runTool(step, userInput, conversationId);
      toolResults.push(result);
   }
   const planEnd = performance.now();
   const synthesisStart = performance.now();
   console.log(
      `⏱️ Total Plan Execution (Tools) took: ${(planEnd - planStart).toFixed(2)}ms`
   );
   // 2. Decide how to return the answer
   if (decision.final_answer_synthesis_required) {
      // If synthesis is required, we combine results.
      // In a more advanced version, you'd send these results back to an LLM to summarize.
      const result = await llmClient.generateText({
         model: 'gpt-4o-mini',
         prompt: `Synthesize the following tool outputs into a final answer:\n\n${toolResults.join('\n\n')}`,
         maxTokens: 200,
         temperature: 0.2,
      });

      const synthesisEnd = performance.now();
      console.log(
         `⏱️ Final Synthesis (LLM) took: ${(synthesisEnd - synthesisStart).toFixed(2)}ms`
      );

      return result.text;
   }

   // Return the last tool's output (or the only output)
   return (
      toolResults[toolResults.length - 1] ||
      "I'm not sure how to help with that."
   );
}

/**
 * Helper function to route individual tool steps
 */
async function runTool(
   step: ToolStep,
   userInput: string,
   conversationId: string
): Promise<string> {
   const toolStart = performance.now();
   let output: string;

   switch (step.tool) {
      case 'getProductInformation':
         output = await getProductInformation(
            step.parameters.product_name,
            step.parameters.query
         );
         break;

      case 'weather':
         output = await getWeather(step.parameters.city);
         break;

      case 'math':
         output = await calculateMath(step.parameters.expression);
         break;

      case 'exchange':
         output = await getExchangeRate(step.parameters.currency);
         break;

      case 'analyzeReview':
         const pythonResult = await analyzeWithPython(
            step.parameters.reviewText
         );
         output = `Sentiment: ${pythonResult.sentiment}, Confidence: ${pythonResult.confidence}`;
         break;

      case 'chat':
         const response = await chatService.sendMessage(
            userInput,
            conversationId
         );
         output = response.message;
         break;

      default:
         output = `Tool ${step.tool} not found.`;
   }

   const toolEnd = performance.now();
   console.log(
      `  └─ 🛠️ Tool [${step.tool}] execution took: ${(toolEnd - toolStart).toFixed(2)}ms`
   );
   return output;
}
