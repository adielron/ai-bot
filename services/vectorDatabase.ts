import { ITEMS, type Item } from './itemCatalog';

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';

export type Embedding = number[];

export interface ItemWithEmbedding {
   item: Item;
   embedding: Embedding;
   text: string; // Combined searchable text
}

export interface VectorStore {
   items: ItemWithEmbedding[];
   initialized: boolean;
}

// In-memory vector store
const vectorStore: VectorStore = {
   items: [],
   initialized: false,
};

/**
 * Generate embedding for text using OpenAI API
 */
export async function generateEmbedding(text: string): Promise<Embedding> {
   if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
   }

   try {
      const response = await fetch(OPENAI_EMBEDDING_URL, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
         },
         body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: text,
         }),
      });

      const data = (await response.json()) as {
         data?: Array<{ embedding?: number[] }>;
         error?: unknown;
      };

      if (!response.ok) {
         throw new Error(
            `OpenAI embedding error: ${JSON.stringify(data.error ?? data)}`
         );
      }

      return data.data?.[0]?.embedding ?? [];
   } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      throw error;
   }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: Embedding, vec2: Embedding): number {
   if (vec1.length !== vec2.length) return 0;

   let dotProduct = 0;
   let magnitude1 = 0;
   let magnitude2 = 0;

   for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      magnitude1 += vec1[i] * vec1[i];
      magnitude2 += vec2[i] * vec2[i];
   }

   const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
   return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Initialize vector database by generating embeddings for all items
 */
export async function initializeVectorDatabase(): Promise<void> {
   if (vectorStore.initialized) {
      console.log('✅ Vector database already initialized');
      return;
   }

   console.log('🔄 [VectorDB] Initializing vector database...');

   try {
      for (const item of ITEMS) {
         // Create comprehensive text for embedding
         const text = `${item.code}. ${item.name}. ${item.description}. Price: ${item.priceILS} ILS. Available in: ${item.countries.join(', ')}. Climate: ${item.climateNote}`;

         console.log(
            `📍 [VectorDB] Generating embedding for item ${item.code}: ${item.name}`
         );
         const embedding = await generateEmbedding(text);

         vectorStore.items.push({
            item,
            embedding,
            text,
         });

         // Small delay to avoid rate limiting
         await new Promise((resolve) => setTimeout(resolve, 100));
      }

      vectorStore.initialized = true;
      console.log(
         `✅ [VectorDB] Vector database initialized with ${vectorStore.items.length} items`
      );
   } catch (error) {
      console.error(
         '❌ [VectorDB] Failed to initialize vector database:',
         error
      );
      throw error;
   }
}

/**
 * Search vector database with semantic query
 * Returns items sorted by relevance (highest similarity first)
 * Default topK is 5, but can be increased for broader searches
 */
export async function semanticSearch(
   query: string,
   topK: number = 5
): Promise<ItemWithEmbedding[]> {
   if (!vectorStore.initialized) {
      throw new Error(
         'Vector database not initialized. Call initializeVectorDatabase() first.'
      );
   }

   console.log(`🔍 [VectorDB] Semantic search for: "${query}"`);

   try {
      // Generate embedding for query
      const queryEmbedding = await generateEmbedding(query);

      // Calculate similarity scores for all items
      const scored = vectorStore.items
         .map((itemWithEmbedding) => ({
            ...itemWithEmbedding,
            score: cosineSimilarity(
               queryEmbedding,
               itemWithEmbedding.embedding
            ),
         }))
         .sort((a, b) => b.score - a.score)
         .slice(0, topK);

      console.log(
         `📊 [VectorDB] Found ${scored.length} results. Top match: ${scored[0]?.item.name} (similarity: ${scored[0]?.score.toFixed(3)})`
      );

      return scored;
   } catch (error) {
      console.error('❌ [VectorDB] Semantic search failed:', error);
      throw error;
   }
}

/**
 * Get all items from vector database
 */
export function getAllItemsFromVector(): ItemWithEmbedding[] {
   return vectorStore.items;
}

/**
 * Find specific item by code
 */
export function getItemByCode(code: string): ItemWithEmbedding | undefined {
   return vectorStore.items.find(
      (item) => item.item.code === code.toUpperCase()
   );
}

/**
 * Get vector database statistics
 */
export function getVectorDBStats() {
   return {
      initialized: vectorStore.initialized,
      itemCount: vectorStore.items.length,
      embeddingDimension: vectorStore.items[0]?.embedding.length ?? 0,
   };
}
