import OpenAI from 'openai';

const client = new OpenAI({
   apiKey: process.env.OPENAI_API_KEY,
});

type generateTextOptions = {
   model?: string;
   prompt: string;
   maxTokens?: number;
   temperature?: number;
   instructions?: string;
   previousResponseId?: string;
};

type generateTextResult = {
   id: string;
   text: string;
};

export const llmClient = {
   async generateText({
      model = 'gpt-4.1',
      prompt,
      maxTokens = 300,
      temperature = 0.2,
      instructions,
      previousResponseId,
   }: generateTextOptions): Promise<generateTextResult> {
      const response = await client.responses.create({
         model,
         input: prompt,
         max_output_tokens: maxTokens,
         temperature,
         instructions,
         previous_response_id: previousResponseId,
      });
      return {
         id: response.id,
         text: response.output_text,
      };
   },
};
