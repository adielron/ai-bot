const rates: Record<string, number> = {
   USD: 3.75,
   EUR: 4.05,
};

export function getExchangeRate(currency: string): string {
   const rate = rates[currency.toUpperCase()];
   if (!rate) return 'Unknown currency';
   return `שער ${currency} הוא ${rate} ש״ח`;
}
