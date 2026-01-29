import OpenAI from 'openai';
import classifier from '../../prompts/classifier.prompt.txt';

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

   try {
      const parsed = JSON.parse(content);

      // Basic validation to ensure the plan exists
      if (!parsed.plan || !Array.isArray(parsed.plan)) {
         throw new Error('Invalid plan format');
      }

      return parsed as RouteDecision;
   } catch (error) {
      console.error('❌ Router Parsing Error:', error);
      // Fallback: Default to a simple chat plan if the LLM fails
      return {
         plan: [{ tool: 'chat', parameters: {} }],
         final_answer_synthesis_required: false,
      };
   }
}
