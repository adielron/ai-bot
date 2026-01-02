export async function callLocalLLM(
   userInput: string,
   instructions: string
): Promise<string> {
   const prompt = instructions.replace('{{USER_INPUT}}', userInput);

   const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
         model: 'phi3',
         prompt,
         stream: false,
      }),
   });

   const data = (await response.json()) as { response: string };

   // Extract the first JSON object using regex

   const jsonStr = extractFirstJsonObject(data.response);
   if (!jsonStr) {
      return data.response; // fallback: raw text
   }

   return jsonStr;
}

export function extractFirstJsonObject(text: string): string | null {
   let start = text.indexOf('{');
   if (start === -1) return null;

   let braceCount = 0;
   for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;

      // when all braces are closed
      if (braceCount === 0) {
         return text.slice(start, i + 1);
      }
   }

   // if no complete object found
   return null;
}
