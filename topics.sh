#!/bin/bash

# Kafka broker address
BROKER="localhost:9092"

# List of required topics
TOPICS=(
  "user-input-events"
  "router_decision_events"
  "llm_prompt_requests"
  "llm_response_events"
  "function_execution_requests"
  "bot_output_events"
  "guardrail_violation_events"
  "cot_math_expression_events"
  "conversation-history-update"
  "user-control-events"
  "intent-math"
  "intent-weather"
  "intent-exchange"
  "intent-general-chat"
  "error_events"
  "app-results"
)

echo "Creating Kafka topics..."

for topic in "${TOPICS[@]}"; do
  kafka-topics.sh --create \
    --bootstrap-server $BROKER \
    --replication-factor 1 \
    --partitions 1 \
    --topic "$topic" \
    2>/dev/null
  echo "✅ Topic created: $topic"
done

echo "All topics created."