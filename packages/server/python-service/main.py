import os
import chromadb
from fastapi import FastAPI, Body
from openai import OpenAI
from dotenv import load_dotenv

# 1. Setup & Environment
load_dotenv()
app = FastAPI()

# Initialize OpenAI and Chroma
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
chroma_client = chromadb.PersistentClient(path="./my_vector_db")

# Get or create the collection officially
collection = chroma_client.get_or_create_collection(name="knowledge_base")

def get_embedding(text):
    """Generates vector embeddings using OpenAI's latest model"""
    response = client.embeddings.create(
        input=[text],
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

# --- ROUTES ---

@app.post("/ingest")
async def ingest_all_files():
    """Reads .txt files from folder and saves them to ChromaDB"""
    docs_dir = "./knowledge-base"
    
    if not os.path.exists(docs_dir):
        return {"error": f"Folder '{docs_dir}' not found."}

    # Optional: Clear existing data to avoid duplicates
    try:
        chroma_client.delete_collection("knowledge_base")
        global collection
        collection = chroma_client.get_or_create_collection(name="knowledge_base")
    except:
        pass

    for filename in os.listdir(docs_dir):
        if filename.endswith(".txt"):
            path = os.path.join(docs_dir, filename)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                
                # Official ChromaDB Add Method
                collection.add(
                    ids=[filename],
                    documents=[content],
                    embeddings=[get_embedding(content)],
                    metadatas=[{"source": filename}]
                )
                print(f"✅ Ingested: {filename}")

    return {"message": f"Ingestion complete. Total items: {collection.count()}"}


@app.post("/search_kb")
async def search_knowledge_base(data: dict = Body(...)):
    user_query = data.get("query", "")
    print(f"🔍 RAG Search: {user_query}")

    if collection.count() == 0:
        return {"context": "The database is empty. Run /ingest first."}

    # 1. Query the database
    results = collection.query(
        query_embeddings=[get_embedding(user_query)],
        n_results=10
    )

    # 2. Join all retrieved documents into one block of text
    if results['documents'] and len(results['documents'][0]) > 0:
        # Join the list of strings with double newlines
        full_context = "\n\n---\n\n".join(results['documents'][0])
        return {"context": full_context}
    
    return {"context": "No relevant info found in local docs."}

# --- LIFESPAN / STARTUP ---

@app.on_event("startup")
async def startup_event():
    print("🚀 RAG Service starting on Port 8000...")
    # Optional: auto-ingest on startup
    await ingest_all_files()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)