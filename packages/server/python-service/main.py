import os


# Trick ChromaDB into thinking these settings exist
os.environ["clickhouse_host"] = "localhost"
os.environ["clickhouse_port"] = "8123"
os.environ["chroma_server_host"] = "localhost"
os.environ["chroma_server_http_port"] = "8000"
os.environ["chroma_server_grpc_port"] = "50051"
# Force it to think it's NOT a managed server
os.environ["is_chroma_managed"] = "false"
try:
    from pydantic_settings import BaseSettings
    import pydantic
    pydantic.BaseSettings = BaseSettings
except ImportError:
    pass



import chromadb
from fastapi import FastAPI, Body
from openai import OpenAI  # Make sure this is the modern client
from dotenv import load_dotenv
from chromadb.utils import embedding_functions
from chromadb.config import Settings

# 1. Setup
load_dotenv()
app = FastAPI()

# Initialize Modern OpenAI Client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize ChromaDB Client
chroma_client = chromadb.Client(Settings(
    chroma_db_impl="duckdb+parquet",
    persist_directory="./my_vector_db"
))

def get_embedding(text):
    """Uses modern OpenAI v1.0+ SDK to get vectors"""
    response = client.embeddings.create(
        input=[text],
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

# --- ROUTES ---

@app.post("/ingest")
async def ingest_all_files():
    docs_dir = "./knowledge-base"
    if not os.path.exists(docs_dir):
        print(f"❌ Folder '{docs_dir}' not found.")
        return {"error": f"Folder '{docs_dir}' not found."}

    # Get collection reference directly from client
    coll = chroma_client.get_or_create_collection(name="knowledge_base")

    # Clear old data to prevent duplicates
    try:
        if chroma_client._count(coll.id) > 0:
            print("Cleaning up old vectors...")
            chroma_client.delete_collection("knowledge_base")
            coll = chroma_client.get_or_create_collection(name="knowledge_base")
    except Exception as e:
        print(f"Cleanup note: {e}")

    for filename in os.listdir(docs_dir):
        if filename.endswith(".txt"):
            path = os.path.join(docs_dir, filename)
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
                
                # DIRECT INGESTION bypassing the broken Collection object
                chroma_client._add(
                    collection_id=coll.id,
                    ids=[filename],
                    documents=[text],
                    metadatas=[{"source": filename}],
                    embeddings=[get_embedding(text)] # Manual modern embedding
                )
                print(f"✅ Ingested: {filename}")
    
    final_count = chroma_client._count(coll.id)
    return {"message": f"Ingested documents. Total in DB: {final_count}"}

@app.post("/search_kb")
async def query_ai(data: dict = Body(...)):
    user_query = data.get("query")
    print(f"🔍 Searching knowledge base for query: {user_query}")
    coll = chroma_client.get_or_create_collection(name="knowledge_base")

    try:
        # Check count using direct client call
        count = chroma_client._count(coll.id)
        if count == 0:
            return {"context": "Database is empty. Please run /ingest first."}

        # Use our modern helper instead of broken openai_ef
        query_vector = [get_embedding(user_query)]
        
        # DIRECT QUERY via client
        results = chroma_client._query(
            collection_id=coll.id,
            query_embeddings=query_vector,
            n_results=1,
            include=['documents']
        )
        
        if results and 'documents' in results and len(results['documents'][0]) > 0:
            best_match = results['documents'][0][0]
            return {"context": best_match}
        
        return {"context": "No relevant matches found."}

    except Exception as e:
        print(f"❌ Direct Query Error: {e}")
        return {"context": "Error searching the knowledge base."}

# --- STARTUP LOGIC ---

@app.on_event("startup")
async def startup_event():
    print("🚀 System starting up... auto-ingesting files.")
    try:
        await ingest_all_files()
        print("✅ Ingestion complete. Database is ready!")
    except Exception as e:
        print(f"❌ Startup Ingestion Failed: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)