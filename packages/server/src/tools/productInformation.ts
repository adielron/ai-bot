/**
 * RAG-based Product Information Tool
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
      `🔍 Routing to RAG: Searching for: ${product_name} - ${query}...`
   );

   try {
      // 1. RETRIEVAL STEP
      const searchResponse = await fetch('http://localhost:8000/search_kb', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            query: `${product_name} ${query}`,
         }),
      });

      if (!searchResponse.ok)
         throw new Error(`Python error: ${searchResponse.statusText}`);

      const searchResults = (await searchResponse.json()) as SearchResponse;

      // If Python returns nothing, we don't even bother the LLM
      const context = searchResults.context?.trim();
      if (!context) {
         return `No documentation found in the knowledge base for "${product_name}".`;
      }

      console.log('📥 RAG Raw Context Length:', context.length);

      // 2. GENERATION STEP (The "Aggressive Extractor" Prompt)
      const RAG_GENERATION_PROMPT = `
      You are a precise data extraction engine. 
      
      --- START CONTEXT ---
      ${context}
      --- END CONTEXT ---

      USER REQUEST: "${query}"
      TARGET CATEGORY/PRODUCT: "${product_name}"

      STRICT INSTRUCTIONS:
      1. Your ONLY job is to extract and summarize the product information found in the START/END CONTEXT above.
      2. Even if the context is about a specific product (like EvoPhone X) and the user asked a general question, you MUST provide the details of the products found in the context.
      3. Do NOT say "I don't have information" if there is any technical data in the context.
      4. Format the output clearly. If price, battery, or camera specs are present, list them.
      5. Do not explain where you got the information. Just give the data.
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
                     content:
                        'You are a technical document parser. You always extract data if it is present.',
                  },
                  { role: 'user', content: RAG_GENERATION_PROMPT },
               ],
               temperature: 0.1, // Near-zero to prevent the LLM from "deciding" to refuse
            }),
         }
      );

      const aiData: any = await aiResponse.json();
      const finalResult = aiData?.choices?.[0]?.message?.content;

      if (finalResult) {
         console.log('✅ RAG Answer Extracted.');
         return finalResult;
      }

      return "I found the documentation, but I couldn't parse the details.";
   } catch (error) {
      console.error('❌ RAG Error:', error);
      return `Error accessing docs for ${product_name}.`;
   }
}
