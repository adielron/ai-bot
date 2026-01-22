Distributed AI Chat System

Team Members

Yaakov Dabush (312370331)

Karni Levy (209136753)

Tomer Barkovich (206408353)

Adi Elron (318723350)

Liran Katnov (021698758)

Project Overview

This project implements a distributed, event-driven AI chatbot system using Kafka, multiple LLM providers, and microservices.

The system routes user input through different AI components (OpenAI, local Ollama models, and a Python Hugging Face service) using Kafka topics as the communication backbone. This architecture improves scalability, reliability, observability, and cost control compared to a monolithic design.

Microservices Overview

1️⃣ API Gateway / User Input Service

Role:

Receives raw user input via HTTP.

Publishes input to Kafka.

Kafka Topics:

Produces → user-input-events

2️⃣ Router Service (Intent Classification)

Role:

Classifies user intent (weather, math, exchange, chat, analyzeReview).

Uses local Ollama first, OpenAI as fallback.

Kafka Topics:

Consumes ← user-input-events

Produces → router-intents

3️⃣ Application Services

Handles domain logic per intent:

Weather Service

Math Service

Exchange Rate Service

Review Analysis Service

Kafka Topics:

Consumes ← router-intents

Produces → app-results

4️⃣ Python Sentiment Analysis Service (Hugging Face)

Role:

Fast sentiment analysis using a BERT-based model.

Used when router confidence is low.

Technology:

FastAPI

Hugging Face pipeline("sentiment-analysis")

5️⃣ Response Aggregator

Role:

Collects application results.

Sends final response to the user.

Kafka Topics:

Consumes ← app-results

Produces → bot-responses

Kafka Topics Summary

Topic

Purpose

user-input-events

Raw user input

router-intents

Intent + parameters

app-results

Tool execution results

bot-responses

Final user response

user-control-events

Reset / control commands

conversation-history

(Optional) chat memory

System Architecture Diagram

Client
  ↓
API Gateway
  ↓
user-input-events
  ↓
Router Service
  ↓
router-intents
  ↓
App Services / Python BERT
  ↓
app-results
  ↓
Response Service
  ↓
User

Challenges & Solutions

1️⃣ Local LLM Performance (Ollama)

Issue: Very slow (30–50s) and unstable JSON.

Solution:

Timeout + OpenAI fallback

Strict JSON validation

2️⃣ Inconsistent LLM Parameters

Issue: Local models invent parameter names.

Solution:

Normalization layer before execution

3️⃣ Kafka Setup Complexity

Issue: Zookeeper vs KRaft confusion.

Solution:

Used Confluent Kafka + Zookeeper for stability

4️⃣ Cost vs Accuracy

Issue: LLMs overkill for simple sentiment tasks.

Solution:

Python Hugging Face microservice for sentiment analysis

Notes

This architecture allows easy scaling, model replacement, and service isolation. Kafka enables loose coupling between services, making the system more robust and production-ready.

