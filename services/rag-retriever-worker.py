# rag-retriever-worker.py
import json
import time
from kafka import KafkaConsumer, KafkaProducer

KAFKA_BROKERS = ['localhost:9092']
CONSUMER_GROUP = 'rag-retriever-worker-group-1'  # append a number
TOOL_NAME = 'getProductInformation'

# Topics
TOOL_REQUESTS_TOPIC = 'tool-invocation-requests'       # Orchestrator sends requests here
TOOL_WORKER_TOPIC = 'tool-worker-requests'            # Worker listens here specifically
TOOL_RESULT_TOPIC = 'ToolInvocationResulted'          # Worker produces results here
CONVERSATION_EVENTS_TOPIC = 'conversation-events'     # Aggregator/orchestrator listens here

# Initialize Kafka producer
producer = KafkaProducer(
    bootstrap_servers=KAFKA_BROKERS,
    value_serializer=lambda m: json.dumps(m).encode('utf-8')
)

def fetch_product_info(input_text: str) -> str:
    """
    Mock RAG retrieval function.
    Replace with actual DB/vector store retrieval.
    """
    time.sleep(0.5)
    return f"Product information for '{input_text}' retrieved successfully."

def listen_tool_requests():
    """
    Listen for tool-invocation-requests, filter for this tool,
    and forward to tool-worker-requests topic.
    """
    consumer = KafkaConsumer(
        TOOL_REQUESTS_TOPIC,
        bootstrap_servers=KAFKA_BROKERS,
        group_id=CONSUMER_GROUP,
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset='earliest'
    )

    print(f"🧩 RAG Retriever Worker listening for tool '{TOOL_REQUESTS_TOPIC}' requests...")

    for message in consumer:
        try:
            print("🔍 Received tool invocation request.")
            event = message.value
            conversation_id = event.get('conversationId')
            payload = event.get('payload')

        

            print(f"📥 ToolInvocationRequest received: {payload} (conversation: {conversation_id})")

            # Forward request to worker-specific topic
            worker_request_event = {
                "eventType": "ToolInvocationRequest",
                "conversationId": conversation_id,
                "timestamp": int(time.time() * 1000),
                "payload": payload
            }
            producer.send(TOOL_WORKER_TOPIC, key=conversation_id.encode('utf-8'), value=worker_request_event)

            producer.flush()

            print(f"📤 ToolInvocationRequest forwarded to {TOOL_WORKER_TOPIC} for conversation {conversation_id}")

        except Exception as e:
            print(f"❌ Error processing tool request: {e}")

def listen_worker_results():
    """
    Listen for ToolInvocationResulted events from this worker
    and forward them to conversation-events topic.
    """
    consumer = KafkaConsumer(
        TOOL_RESULT_TOPIC,
        bootstrap_servers=KAFKA_BROKERS,
        group_id=CONSUMER_GROUP + "-results",
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset='earliest'
    )

    print(f"🧩 RAG Retriever Worker listening for ToolInvocationResulted events...")

    for message in consumer:
        try:
            event = message.value
            conversation_id = event.get('conversationId')
            payload = event.get('payload')

            print(f"📥 ToolInvocationResulted received: {payload} (conversation: {conversation_id})")

            # Forward to conversation-events topic
            producer.send(CONVERSATION_EVENTS_TOPIC, key=conversation_id.encode('utf-8'), value=event)
            producer.flush()

            print(f"📤 ToolInvocationResulted forwarded to {CONVERSATION_EVENTS_TOPIC} for conversation {conversation_id}")

        except Exception as e:
            print(f"❌ Error forwarding ToolInvocationResulted: {e}")

if __name__ == "__main__":
    import threading

    # Start both consumers in parallel threads
    threading.Thread(target=listen_tool_requests, daemon=True).start()
    threading.Thread(target=listen_worker_results, daemon=True).start()

    print("🧩 RAG Retriever Worker is running...")

    # Keep the main thread alive
    while True:
        time.sleep(1)
