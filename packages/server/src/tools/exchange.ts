import { llmClient } from '../../llm/client.ts';

const rateToILS: Record<string, number> = {
   USD: 3.75,
   EUR: 4.05,
   ILS: 1.0,
};

function normalizeCurrency(code?: string): string | undefined {
   if (!code) return undefined;
   const normalized = code.toUpperCase().replace(/₪|ש״ח|NIS/, 'ILS');
   if (['USD', 'EUR', 'ILS'].includes(normalized)) return normalized;
   return undefined;
}

export async function getExchangeRate(
   instructionOrCurrency: string,
   context?: string
): Promise<string> {
   const instruction = String(instructionOrCurrency || '').trim();
   const targetCurrency = normalizeCurrency(
      instruction.match(/\b(USD|EUR|ILS|NIS|₪|ש״ח)\b/i)?.[0]
   );

   const amountMatch = context?.match(
      /([0-9]+(?:[.,][0-9]+)?)(?:\s*)(USD|EUR|ILS|NIS|₪|ש״ח)?/i
   );
   const rawAmount = amountMatch?.[1];
   const sourceCurrency = normalizeCurrency(
      amountMatch?.[2] ??
         context?.match(/\b(USD|EUR|ILS|NIS|₪|ש״ח)\b/i)?.[0] ??
         undefined
   );
   const amount = rawAmount
      ? parseFloat(rawAmount.replace(',', '.'))
      : undefined;

   if (
      targetCurrency &&
      amount !== undefined &&
      sourceCurrency &&
      rateToILS[sourceCurrency] !== undefined &&
      rateToILS[targetCurrency] !== undefined
   ) {
      const amountInILS = amount * rateToILS[sourceCurrency];
      const converted = amountInILS / rateToILS[targetCurrency];
      return `${amount.toFixed(2)} ${sourceCurrency} is ${converted.toFixed(2)} ${targetCurrency}.`;
   }

   const prompt = `You are a currency conversion assistant.

AVAILABLE CONTEXT:
${context?.trim() || 'No context provided.'}

USER REQUEST:
"${instruction}"

RATES:
1 USD = ${rateToILS.USD} ILS
1 EUR = ${rateToILS.EUR} ILS
1 ILS = 1.00 ILS

INSTRUCTIONS:
1. Identify the numeric amount and source currency from the context or the request.
2. Convert the amount to the requested target currency.
3. Return a short, exact answer like "123.45 USD is 456.78 ILS.".
4. If you cannot determine an amount or currency, explain that the conversion cannot be completed.
`;

   try {
      const response = await llmClient.generateText({
         model: 'gpt-4o-mini',
         prompt,
         temperature: 0,
      });

      return response.text.trim();
   } catch (error) {
      console.error('💱 Exchange tool error:', error);
      return 'I could not complete the currency conversion.';
   }
}
