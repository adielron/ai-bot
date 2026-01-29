/**
 * RAG-based Product Information Tool
 * @param product_name - The name of the product (e.g., "iPhone 16")
 * @param query - What the user wants to know (e.g., "price", "battery life")
 *
 */
interface SearchResponse {
   context: string;
   distances?: number[][];
   ids?: string[][];
}

export async function getProductInformation(
   product_name: string,
   query: string
): Promise<string> {
   console.log(
      `🔍 Routing to RAG: Searching knowledge base for: ${product_name} - ${query}...`
   );

   try {
      // 1. RETRIEVAL STEP: Call the Python Microservice
      // We combine product name and query for a better vector search match
      const searchResponse = await fetch('http://localhost:8000/search_kb', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            query: `${product_name} ${query}`,
         }),
      });

      if (!searchResponse.ok) {
         throw new Error(`Python service error: ${searchResponse.statusText}`);
      }

      // Get the retrieved text chunks (Context) from Python
      const searchResults = (await searchResponse.json()) as SearchResponse;
      const context =
         searchResults.context || 'No relevant documentation found.';

      // 2. GENERATION STEP (Augmented): Use OpenAI to synthesize the answer
      const RAG_GENERATION_PROMPT = `
      You are a professional product expert.
      Use the following retrieved context to answer the user's question about ${product_name}.
      
      Rules:
      1. If the information is not in the context, state that you don't have that specific information in your documentation.
      2. Keep the answer concise and professional.
      3. Base your response strictly on the context provided.

      Context:
      ${context}

      User Question: ${query}
    `;

      const aiResponse = await fetch(
         'https://api.openai.com/v1/chat/completions',
         {
            method: 'POST',
            headers: {
               Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
               'Content-Type': 'application/json',
            },
            body: JSON.stringify({
               model: 'gpt-4o-mini',
               messages: [
                  {
                     role: 'system',
                     content: 'You are a precise product advisor.',
                  },
                  {
                     role: 'user',
                     content: RAG_GENERATION_PROMPT,
                  },
               ],
               temperature: 0.3, // Lower temperature ensures the LLM sticks to facts
            }),
         }
      );

      const aiData: any = await aiResponse.json();

      if (aiData?.choices?.[0]?.message?.content) {
         const finalAnswer = aiData.choices[0].message.content;
         console.log('✅ RAG Answer Generated successfully.');
         return finalAnswer;
      }

      throw new Error('Unexpected OpenAI response structure');
   } catch (error) {
      console.error('❌ RAG Error in getProductInformation:', error);
      return `I'm sorry, I'm having trouble accessing the technical documentation for ${product_name} right now.`;
   }
}
