export async function analyzeWithPython(text: string) {
   const response = await fetch('http://localhost:8000/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
   });

   return response.json() as Promise<{
      sentiment: string;
      confidence: number;
   }>;
}
