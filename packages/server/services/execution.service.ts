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
   console.log(
      '🔧 [EXECUTION] Starting tool execution for plan:',
      JSON.stringify(decision.plan, null, 2)
   );
   console.log(
      '🤖 [EXECUTION] Synthesis required:',
      decision.final_answer_synthesis_required
   );
   const toolResults: string[] = [];
   const planStart = performance.now();

   for (const step of decision.plan) {
      console.log(
         `⚙️ [EXECUTION] Executing tool: ${step.tool} with params:`,
         step.parameters
      );
      // 1. Build a cumulative context from all validated results gathered so far
      const cumulativeContext = toolResults.filter(Boolean).join('\n\n---\n\n');

      // 2. Pass that context into the next tool in the plan
      const result = await runTool(
         step,
         userInput,
         conversationId,
         cumulativeContext
      );
      toolResults.push(result ?? `No output from ${step.tool}.`);
      console.log(
         `✅ [EXECUTION] Tool ${step.tool} completed. Result length: ${(result ?? '').length}`
      );
   }

   const planEnd = performance.now();
   console.log(
      `⏱️ [EXECUTION] Total Plan Execution (Tools) took: ${(planEnd - planStart).toFixed(2)}ms`
   );

   const validResults = toolResults.filter(Boolean);
   const shouldSynthesize =
      decision.final_answer_synthesis_required || validResults.length > 1;

   if (shouldSynthesize) {
      console.log('🧠 [EXECUTION] Starting final answer synthesis...');
      const synthesized = await synthesizeFinalAnswer(userInput, validResults);
      console.log(
         '🎯 [EXECUTION] Synthesis completed. Final answer length:',
         synthesized.length
      );
      return synthesized;
   }

   if (validResults.length >= 1) {
      console.log('📋 [EXECUTION] Returning last tool result.');
      return validResults.at(-1) ?? 'No results found.';
   }

   console.log('❓ [EXECUTION] No valid results, returning default message.');
   return "I'm not sure how to help with that.";
}

async function synthesizeFinalAnswer(
   userInput: string,
   toolResults: string[]
): Promise<string> {
   console.log(
      '🧠 [SYNTHESIS] Building synthesis prompt for user input:',
      userInput.substring(0, 50) + '...'
   );
   console.log('📊 [SYNTHESIS] Tool results count:', toolResults.length);
   const prompt = `You are an assistant that combines multiple tool results into a single, polished answer.

USER QUESTION:
"${userInput}"

TOOL RESULTS:
${toolResults.map((result, index) => `${index + 1}. ${result}`).join('\n\n')}

INSTRUCTIONS:
1. Use the tool results to answer the user's question accurately.
2. Do not mention that you are synthesizing tool output.
3. Do not repeat internal tool names or logs.
4. Return a single coherent answer that directly addresses the user's request.
`;

   try {
      console.log('🤖 [SYNTHESIS] Calling LLM for synthesis...');
      const response = await llmClient.generateText({
         model: 'gpt-4o-mini',
         prompt,
         temperature: 0,
         maxTokens: 400,
      });

      const synthesis = response.text.trim();
      console.log(
         '✅ [SYNTHESIS] LLM synthesis completed. Length:',
         synthesis.length
      );
      if (synthesis) return synthesis;
   } catch (error) {
      console.error('❌ [SYNTHESIS] Final synthesis error:', error);
   }

   console.log('⚠️ [SYNTHESIS] Synthesis failed, returning raw results.');
   return toolResults.join('\n\n');
}

/**
 * Helper function to route individual tool steps with shared context
 */
async function runTool(
   step: ToolStep,
   userInput: string,
   conversationId: string,
   context?: string // <--- Context parameter added
): Promise<string> {
   const toolStart = performance.now();
   console.log(
      `🔧 [TOOL] Starting ${step.tool} with context length: ${(context ?? '').length}`
   );
   let output: string;

   switch (step.tool) {
      case 'getProductInformation':
         console.log(
            `📚 [TOOL] Calling RAG for product: ${step.parameters.product_name}`
         );
         output = await getProductInformation(
            step.parameters.product_name,
            step.parameters.query
         );
         console.log(
            `📖 [TOOL] RAG completed for ${step.parameters.product_name}`
         );
         break;

      case 'math':
         console.log(
            `🧮 [TOOL] Calling math tool with expression: ${step.parameters.expression}`
         );
         // Now passing the context so the LLM can see the prices and totals from earlier tools
         output = await calculateMath(step.parameters.expression, context);
         console.log(`✅ [TOOL] Math calculation completed`);
         break;

      case 'weather':
         console.log(
            `🌤️ [TOOL] Fetching weather for city: ${step.parameters.city}`
         );
         output = await getWeather(step.parameters.city);
         console.log(`🌤️ [TOOL] Weather fetched for ${step.parameters.city}`);
         break;

      case 'exchange':
         console.log(
            `💱 [TOOL] Converting currency with input: ${step.parameters.currency ?? step.parameters.instruction ?? userInput}`
         );
         output = await getExchangeRate(
            step.parameters.currency ??
               step.parameters.instruction ??
               userInput,
            context
         );
         console.log(`💱 [TOOL] Currency conversion completed`);
         break;

      case 'analyzeReview':
         console.log(`📊 [TOOL] Analyzing review sentiment`);
         const pythonResult = await analyzeWithPython(
            step.parameters.reviewText
         );
         output = `Sentiment: ${pythonResult.sentiment}, Confidence: ${pythonResult.confidence}`;
         console.log(
            `📊 [TOOL] Review analysis completed: ${pythonResult.sentiment}`
         );
         break;

      case 'chat':
         if (step.parameters.illegal) {
            console.log(
               `🚫 [TOOL] Illegal content detected, returning safe response`
            );
            output = "Sorry, I can't answer that.";
         } else {
            console.log(`💬 [TOOL] Calling chat service`);
            const response = await chatService.sendMessage(
               userInput,
               conversationId
            );
            output = response.message;
            console.log(`💬 [TOOL] Chat service completed`);
         }
         break;

      default:
         console.log(`❓ [TOOL] Unknown tool: ${step.tool}`);
         output = `Tool ${step.tool} not found.`;
   }

   const toolEnd = performance.now();
   console.log(
      `⏱️ [TOOL] ${step.tool} execution took: ${(toolEnd - toolStart).toFixed(2)}ms`
   );
   return String(output ?? `No output from ${step.tool}.`);
}
