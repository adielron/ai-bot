from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

app = FastAPI()

# Load model ONCE at startup
classifier = pipeline(
    "sentiment-analysis",
    model="distilbert-base-uncased-finetuned-sst-2-english"
)

class ReviewRequest(BaseModel):
    text: str

@app.post("/analyze")
def analyze_sentiment(request: ReviewRequest):
    result = classifier(request.text)[0]
    return {
        "sentiment": result["label"],
        "confidence": result["score"]
    }