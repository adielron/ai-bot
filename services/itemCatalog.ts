export type Item = {
   code: string;
   name: string;
   priceILS: number;
   countries: string[];
   exampleCity: string;
   climateNote: string;
   description: string;
};

export const ITEMS: Item[] = [
   {
      code: 'A',
      name: 'NVIDIA RTX 5090 FE',
      priceILS: 11500,
      countries: ['Germany', 'Brazil'],
      exampleCity: 'Berlin',
      climateNote:
         'Best used in cool, dry environments; avoid hot and humid conditions.',
      description: 'High-end GPU for gaming and AI workloads.',
   },
   {
      code: 'B',
      name: 'Samsung 990 Pro 4TB',
      priceILS: 2800,
      countries: ['USA', 'UK'],
      exampleCity: 'London',
      climateNote:
         'Performs well in moderate climates and should be kept away from extreme heat.',
      description: 'Ultra-fast NVMe SSD for storage-intensive applications.',
   },
   {
      code: 'C',
      name: 'AMD Ryzen 9 9950X',
      priceILS: 3450,
      countries: ['Germany', 'Brazil'],
      exampleCity: 'Munich',
      climateNote:
         'Best in well-ventilated systems; avoid high humidity environments.',
      description: 'Top-tier desktop CPU for productivity and gaming.',
   },
   {
      code: 'D',
      name: 'DDR5 RAM 128GB Kit',
      priceILS: 4200,
      countries: ['USA', 'Germany'],
      exampleCity: 'Berlin',
      climateNote:
         'Stable in dry air and should be stored in static-safe packaging.',
      description: 'High-capacity RAM kit for demanding workflows.',
   },
   {
      code: 'E',
      name: 'Kafka-Edge Gateway',
      priceILS: 1950,
      countries: ['Germany', 'Brazil'],
      exampleCity: 'São Paulo',
      climateNote:
         'Designed for edge deployments; avoids direct sun and extreme moisture.',
      description: 'Network appliance for Kafka streaming at the edge.',
   },
   {
      code: 'F',
      name: 'Intel Core i9-13900KS',
      priceILS: 3900,
      countries: ['UK', 'Germany'],
      exampleCity: 'London',
      climateNote:
         'Requires robust cooling; optimal in climate-controlled environments.',
      description:
         'High-performance desktop processor for gaming and content creation.',
   },
   {
      code: 'G',
      name: 'Apple MacBook Pro 16" M3 Max',
      priceILS: 8500,
      countries: ['USA', 'UK'],
      exampleCity: 'New York',
      climateNote: 'Works in all climates; excellent thermal management.',
      description:
         'Professional laptop for video editing and software development.',
   },
   {
      code: 'H',
      name: 'Sony WH-1000XM5 Headphones',
      priceILS: 1650,
      countries: ['Brazil', 'Germany'],
      exampleCity: 'Rio de Janeiro',
      climateNote:
         'Moisture-resistant; suitable for humid and tropical climates.',
      description: 'Premium noise-cancelling wireless headphones.',
   },
   {
      code: 'I',
      name: 'LG 27" 4K Monitor',
      priceILS: 2200,
      countries: ['USA', 'UK'],
      exampleCity: 'Manchester',
      climateNote: 'Best in moderate temperatures; avoid direct sunlight.',
      description: 'Professional-grade 4K IPS monitor for creative work.',
   },
   {
      code: 'J',
      name: 'Corsair RM850x Power Supply',
      priceILS: 950,
      countries: ['Germany', 'Brazil'],
      exampleCity: 'Frankfurt',
      climateNote: 'Designed for cool, well-ventilated spaces.',
      description: 'Fully modular 850W power supply with 80+ Gold efficiency.',
   },
   {
      code: 'K',
      name: 'ASUS ROG Strix Z890-E Motherboard',
      priceILS: 2850,
      countries: ['USA', 'Germany'],
      exampleCity: 'Los Angeles',
      climateNote: 'Stable in dry environments; avoid moisture exposure.',
      description:
         'Premium Intel Z890 motherboard for serious gaming and overclocking.',
   },
   {
      code: 'L',
      name: 'WD Red Pro 12TB NAS Drive',
      priceILS: 2100,
      countries: ['UK', 'Brazil'],
      exampleCity: 'São Paulo',
      climateNote:
         'Designed for 24/7 operation; suitable for warm climates with proper cooling.',
      description: 'Reliable hard drive for network-attached storage systems.',
   },
   {
      code: 'M',
      name: 'Asus ProArt Display PA348QV Monitor',
      priceILS: 3200,
      countries: ['Germany', 'USA'],
      exampleCity: 'Munich',
      climateNote: 'Precision color reproduction in controlled environments.',
      description:
         'Professional color-accurate monitor for designers and photographers.',
   },
   {
      code: 'N',
      name: 'Crucial P5 Plus 2TB SSD',
      priceILS: 1400,
      countries: ['UK', 'Brazil'],
      exampleCity: 'London',
      climateNote: 'Fast and reliable in all moderate climates.',
      description: 'Fast NVMe SSD for general computing and gaming.',
   },
   {
      code: 'O',
      name: 'Logitech MX Master 3S Mouse',
      priceILS: 680,
      countries: ['USA', 'Germany'],
      exampleCity: 'Berlin',
      climateNote: 'Universal compatibility; works in any environment.',
      description: 'Premium wireless mouse for professionals and power users.',
   },
];

// Country and city mapping for better location queries
export const COUNTRY_CITIES: Record<string, string[]> = {
   Germany: ['Berlin', 'Munich', 'Frankfurt', 'Hamburg'],
   Brazil: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador'],
   USA: ['New York', 'Los Angeles', 'Chicago', 'Houston'],
   UK: ['London', 'Manchester', 'Birmingham', 'Leeds'],
};

// Simple database functions (can be extended to use SQLite or PostgreSQL)
export interface ItemDatabase {
   items: Item[];
   lastUpdated: string;
}

export function serializeDatabase(): ItemDatabase {
   return {
      items: ITEMS,
      lastUpdated: new Date().toISOString(),
   };
}

export function deserializeDatabase(data: ItemDatabase): void {
   if (Array.isArray(data.items)) {
      ITEMS.length = 0;
      ITEMS.push(...data.items);
      console.log(`📦 [Database] Loaded ${ITEMS.length} items from database`);
   }
}

export function normalizeText(value: string): string {
   return value.trim().toLowerCase();
}

export function findItemByCodeOrName(text: string): Item | undefined {
   const normalized = normalizeText(text);
   const codeMatch = normalized.match(/\b([a-o])\b/i); // Support codes A-O
   if (codeMatch?.[1]) {
      const code = codeMatch[1].toUpperCase();
      const byCode = ITEMS.find((item) => item.code === code);
      if (byCode) {
         return byCode;
      }
   }

   return ITEMS.find((item) => {
      const normalizedName = normalizeText(item.name);
      return (
         normalizedName === normalized ||
         normalizedName.includes(normalized) ||
         normalized.includes(normalizedName) ||
         normalizeText(item.description).includes(normalized)
      );
   });
}

export function searchItemsByCountry(text: string): Item[] {
   const normalized = normalizeText(text);
   return ITEMS.filter((item) =>
      item.countries.some((country) =>
         normalizeText(country).includes(normalized)
      )
   );
}

export function allItems(): Item[] {
   return ITEMS;
}

export function formatItemDetails(item: Item): string {
   const usd = (item.priceILS / 3.7).toFixed(2);
   const eur = (item.priceILS / 4.0).toFixed(2);
   return (
      `Item ${item.code}: ${item.name}\n` +
      `- Price: ${item.priceILS} ILS (${usd} USD / ${eur} EUR)\n` +
      `- Available Countries: ${item.countries.join(', ')}\n` +
      `- Example City: ${item.exampleCity}\n` +
      `- Climate Note: ${item.climateNote}\n` +
      `- Description: ${item.description}`
   );
}

export function formatCatalogList(items: Item[]): string {
   if (items.length === 0) {
      return 'No catalog items matched your query.';
   }

   return items
      .map((item) => `${item.code}: ${item.name} - ${item.priceILS} ILS`)
      .join('\n');
}

export function formatCountrySummary(items: Item[]): string {
   if (items.length === 0) {
      return 'No items were found for that country.';
   }

   const names = items.map((item) => `${item.code}: ${item.name}`).join(', ');
   return `Items available in this country: ${names}`;
}

export function totalPriceForItems(items: Item[]): string {
   const total = items.reduce((sum, item) => sum + item.priceILS, 0);
   return `Total price for matched items: ${total} ILS.`;
}
