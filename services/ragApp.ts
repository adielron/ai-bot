import { Kafka } from 'kafkajs';
import { type BaseEvent } from '../shared/types';
import {
   allItems,
   findItemByCodeOrName,
   formatCatalogList,
   searchItemsByCountry,
   totalPriceForItems,
   type Item,
} from './itemCatalog';
import { renderRAGAnswerWithLLM } from './llmService';
import { addContextEntry } from './conversationContext';
import {
   initializeVectorDatabase,
   semanticSearch,
   getItemByCode,
   getAllItemsFromVector,
   getVectorDBStats,
} from './vectorDatabase';

const kafka = new Kafka({
   clientId: 'rag-app',
   brokers: ['localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'rag-app-group' });
const producer = kafka.producer();

function extractCountry(query: string): string | null {
   const match = query.match(/\b(germany|brazil|usa|uk|united kingdom)\b/i);
   return match ? match[0] : null;
}

function extractCurrency(query: string): 'USD' | 'EUR' | 'ILS' | null {
   if (/\busd\b/i.test(query)) return 'USD';
   if (/\beur\b/i.test(query)) return 'EUR';
   if (/\bils\b|\bshekel\b/i.test(query)) return 'ILS';
   return null;
}

function convertPrice(
   priceILS: number,
   currency: 'USD' | 'EUR' | 'ILS' | null
): string {
   if (currency === 'USD') {
      return `${(priceILS / 3.7).toFixed(2)} USD`;
   }
   if (currency === 'EUR') {
      return `${(priceILS / 4.0).toFixed(2)} EUR`;
   }
   return `${priceILS} ILS`;
}

/**
 * Use vector database for semantic search
 * Returns most relevant items based on query meaning
 */
async function semanticRAGSearch(
   query: string,
   topK: number = 5
): Promise<Item[]> {
   try {
      console.log(
         `🔍 [RAGApp] Performing semantic search for: "${query}" (topK=${topK})`
      );
      const results = await semanticSearch(query, topK);
      const items = results.map((r) => r.item);
      console.log(
         `✅ [RAGApp] Semantic search returned ${items.length} results: ${items.map((i) => i.name).join(', ')}`
      );
      return items;
   } catch (error) {
      console.error(
         '❌ [RAGApp] Semantic search failed, falling back to keyword search:',
         error
      );
      // Fallback: return all items if semantic search fails
      return allItems();
   }
}

async function buildVectorAnswer(
   query: string,
   semanticResults: Item[],
   productName?: string
): Promise<string> {
   const lower = query.toLowerCase();
   const currency = extractCurrency(query);

   // First, try to find a specific item if user asks about a particular product or "where to buy"
   let item: Item | undefined;
   if (productName) {
      item = findItemByCodeOrName(productName);
   } else if (
      lower.includes('where') ||
      lower.includes('buy') ||
      lower.includes('available')
   ) {
      // For "where can I buy" queries, extract the product name from the query
      item = findItemByCodeOrName(query);
   } else {
      item = findItemByCodeOrName(query);
   }

   // If we found a specific item, provide detailed info about it
   if (item) {
      if (
         lower.includes('where') ||
         lower.includes('buy') ||
         lower.includes('available')
      ) {
         // User asking: where to buy, what countries, availability
         return `${item.code}: ${item.name} is available in: ${item.countries.join(', ')}. Price: ${convertPrice(item.priceILS, currency)}.`;
      }

      if (lower.includes('price') || lower.includes('cost')) {
         const priceText = convertPrice(item.priceILS, currency);
         return `Price for ${item.name}: ${priceText}. Available in ${item.countries.join(', ')}.`;
      }

      if (lower.includes('country') || lower.includes('available')) {
         return `Item ${item.name} is available in ${item.countries.join(', ')}.`;
      }

      if (lower.includes('climate') || lower.includes('weather')) {
         return `Climate note for ${item.name}: ${item.climateNote} Example city: ${item.exampleCity}.`;
      }

      return `${item.code}: ${item.name}\nPrice: ${item.priceILS} ILS\nCountries: ${item.countries.join(', ')}\nDescription: ${item.description}`;
   }

   // Handle catalog listing
   if (
      lower.includes('product') ||
      lower.includes('items') ||
      lower.includes('catalog') ||
      lower.includes('show') ||
      lower.includes('list') ||
      lower.includes('all') ||
      lower.includes('everything') ||
      lower.includes('complete')
   ) {
      const itemsToList =
         semanticResults.length > 0 ? semanticResults : allItems();
      return formatCatalogList(itemsToList);
   }

   // Handle price comparison - find cheapest
   if (lower.includes('cheapest') || lower.includes('lowest')) {
      const itemsToCompare =
         semanticResults.length > 0 ? semanticResults : allItems();
      if (itemsToCompare.length === 0) {
         return 'No items found in the catalog to compare prices.';
      }
      const cheapest = itemsToCompare.reduce(
         (prev, current) => (current.priceILS < prev.priceILS ? current : prev),
         itemsToCompare[0]!
      );
      return `Cheapest item is ${cheapest.code}: ${cheapest.name} for ${cheapest.priceILS} ILS.`;
   }

   // Handle price queries - list prices of matched items
   if (
      lower.includes('price') ||
      lower.includes('cost') ||
      lower.includes('how much')
   ) {
      if (semanticResults.length > 0) {
         return formatCatalogList(semanticResults);
      }
   }

   // Default: return semantic results
   if (semanticResults.length > 0) {
      return (
         'Based on semantic search, here are the most relevant items:\n' +
         formatCatalogList(semanticResults)
      );
   }

   return 'I could not find a matching item in the catalog. Try asking about an item code, product name, price, or features.';
}

async function start() {
   await producer.connect();
   await consumer.connect();

   // Initialize vector database on startup
   try {
      console.log('🚀 [RAGApp] Initializing vector database on startup...');
      await initializeVectorDatabase();
      const stats = getVectorDBStats();
      console.log(
         `✅ [RAGApp] Vector DB ready: ${stats.itemCount} items, ${stats.embeddingDimension} dimensions`
      );
   } catch (error) {
      console.error(
         '❌ [RAGApp] Vector database initialization failed:',
         error
      );
      console.error('⚠️  RAG will use fallback keyword search');
   }

   await consumer.subscribe({ topic: 'intent-rag' });

   console.log('📚 RAG App is running with vector semantic search...');

   await consumer.run({
      eachMessage: async ({ message }) => {
         const userId = message.key?.toString();
         if (!userId || !message.value) return;

         const event = JSON.parse(message.value.toString()) as BaseEvent;
         let payload: {
            query: string;
            product_name?: string;
            requiresNumbers?: boolean;
         } = { query: event.payload };

         try {
            payload = JSON.parse(event.payload) as {
               query: string;
               product_name?: string;
               requiresNumbers?: boolean;
            };
         } catch {
            payload = { query: event.payload };
         }

         console.log(
            `\n🔍 [RAGApp] Query received: "${payload.query}" | Requires Numbers: ${payload.requiresNumbers}`
         );

         // Perform semantic search using vector database
         // Use higher topK if requesting prices, doing multi-tool operations, or asking for all data
         const queryLower = payload.query.toLowerCase();
         const askingForPrice =
            queryLower.includes('price') ||
            queryLower.includes('cost') ||
            queryLower.includes('how much');
         const askingForMath =
            /\b(multiply|times|divide|add|plus|minus|sum|total)\b/.test(
               queryLower
            );
         const askingForAll =
            queryLower.includes('all') ||
            queryLower.includes('everything') ||
            queryLower.includes('complete');
         const topK = askingForAll
            ? 15
            : askingForPrice || askingForMath || payload.requiresNumbers
              ? 10
              : 5;

         const semanticResults = await semanticRAGSearch(payload.query, topK);

         // Build answer using semantic results
         const localAnswer = await buildVectorAnswer(
            payload.query,
            semanticResults,
            payload.product_name
         );

         // Enhance with LLM
         const answer = await renderRAGAnswerWithLLM(
            payload.query,
            localAnswer
         );

         // Extract numbers from items found in the search
         let numbers: number[] | undefined = undefined;

         // Always extract prices when:
         // 1. Query asks for prices AND items were found
         // 2. Math chaining is specifically requested
         if (
            semanticResults.length > 0 &&
            (askingForPrice || (payload.requiresNumbers && askingForMath))
         ) {
            // Extract prices from items found
            numbers = semanticResults.map((item) => item.priceILS);
            console.log(
               `💰 [RAGApp] Price query detected. Extracted ${numbers.length} prices for potential math operations: [${numbers.join(', ')}]`
            );
         } else if (payload.requiresNumbers && semanticResults.length > 0) {
            // Fallback: if math chaining requested, extract all prices anyway
            numbers = semanticResults.map((item) => item.priceILS);
            console.log(
               `🔢 [RAGApp] Math chaining requested. Extracted ${numbers.length} prices: [${numbers.join(', ')}]`
            );
         }

         const responseEvent: BaseEvent = {
            eventType: 'ragResult',
            conversationId: userId,
            timestamp: Date.now(),
            payload: JSON.stringify({
               answer,
               metadata: { numbers: numbers || [] },
            }),
         };

         // Store in conversation context for inter-tool communication
         const itemsForContext = semanticResults.map((item) => ({
            code: item.code,
            name: item.name,
            price: item.priceILS,
         }));
         addContextEntry(
            userId,
            'rag',
            payload.query,
            answer,
            numbers,
            itemsForContext
         );

         console.log(
            `📤 [RAGApp] Sending ragResult with ${numbers?.length ?? 0} numbers: [${numbers?.join(', ') ?? 'none'}]`
         );
         await producer.send({
            topic: 'conversation-events',
            messages: [{ key: userId, value: JSON.stringify(responseEvent) }],
         });
      },
   });
}

start().catch(console.error);
