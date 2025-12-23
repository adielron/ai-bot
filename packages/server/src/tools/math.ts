export function calculateMath(expression: string): string {
   try {
      // ⚠️ רק לתרגיל! לא לפרודקשן
      const result = Function(`return ${expression}`)();
      return `Result: ${result}`;
   } catch {
      return 'Invalid math expression';
   }
}
