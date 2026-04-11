import OpenAI from 'openai';
import classifier from '../../prompts/classifier.prompt.txt';
import { log } from 'node:console';

const client = new OpenAI({
   apiKey: process.env.OPENAI_API_KEY,
});

export interface ToolStep {
   tool: string;
   parameters: Record<string, any>;
}

export interface RouteDecision {
   plan: ToolStep[];
   final_answer_synthesis_required: boolean;
}

export async function routeUserIntent(
   userInput: string
): Promise<RouteDecision> {
   console.log(
      '🤖 [ROUTER-LLM] Calling classifier LLM for user input:',
      userInput.substring(0, 50) + '...'
   );
   const response = await client.chat.completions.create({
      // Fixed: changed to standard chat.completions
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 500, // Increased to allow for complex multi-step plans
      messages: [
         {
            role: 'system',
            content: classifier,
         },
         {
            role: 'user',
            content: userInput,
         },
      ],
      response_format: { type: 'json_object' }, // Forces OpenAI to return valid JSON
   });

   const content = response.choices[0]?.message.content || '{}';
   console.log('🔍 [ROUTER-LLM] Raw LLM response:', content);

   try {
      const parsed = JSON.parse(content);
      console.log('✅ [ROUTER-LLM] Parsed response successfully');

      // Basic validation to ensure the plan exists
      if (!parsed.plan || !Array.isArray(parsed.plan)) {
         throw new Error('Invalid plan format');
      }

      console.log(
         '📋 [ROUTER-LLM] Valid plan found with',
         parsed.plan.length,
         'steps'
      );
      return parsed as RouteDecision;
   } catch (error) {
      console.error('❌ [ROUTER-LLM] Parsing error:', error);
      // Fallback: Default to a simple chat plan if the LLM fails
      console.log('🔄 [ROUTER-LLM] Using fallback chat plan');
      return {
         plan: [{ tool: 'chat', parameters: {} }],
         final_answer_synthesis_required: false,
      };
   }
}
