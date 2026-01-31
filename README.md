# Event-Driven Architecture using Kafka

This allows the Hybrid Agent to be highly scalable and resilient—if the Python AI service is busy, the messages stay queued in Kafka rather than crashing the system. I used Docker Compose to manage the infrastructure, ensuring a consistent environment for the brokers and zookeepers.


To install dependencies:

```bash
bun install

```

To run:

```bash
docker compose up -d
```
Open a new terminal for each of these (or run them in the background). These services listen to the message bus to process product data in real-time.

# Terminal A: Consumer Service
``
bun run services/consumer.ts
``
# Terminal B: Producer/Inventory Service
``
bun run services/producer.ts
``
#......

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.


טבלת הערכת ביצועים  
        scinario 	|         model         |    (ms)        זמן עיבוד ממוצע לאירוע      |  	קצב אירועים מרבי (Events/sec)|	presicion (1-5) total cost 
Router (PlanGenerated)	  Ollama (Llama3 8B)	                    250–400 ms	                            ~3–5	                           0
Router (Fallback)	      OpenAI GPT-3.5	                          600–900 ms                           	~1–2	          5	                            $
Orchestrator (ToolInvocationRequested) 	Stateful Processor (Node/TS)	10–30 ms	                             ~ 500                                    0
Tool: RAG Retrieval	HF Embeddings (Python, CPU)	                         120–250 ms	                       ~ 10–15	                   5	                  0
Tool: LLM Infer (Local)	                   Ollama (Llama3 8B)	             700–1200 ms                  	~0.8–1.2	3–4                                    	0
Tool: LLM Infer (Cloud)                    	OpenAI GPT-3.5	                                 800–1500 ms	~1	5	                                    $
Aggregator (SynthesizeFinalAnswerRequested)	Stateful Processor	          15–40 ms	300+	                                    N/ A                             	0
Final Synthesis	OpenAI GPT-3.5                                              	700–1200 ms	~1	5	$
End-to-End Latency (Complex Plan)	                                                6  ms                       5                                                $$



ניתוח ומסקנות

למה Kafka?
בחרנו ב-Kafka כ־Event Store כדי לשמור את כל האירועים (UserMessageReceived, PlanStepRequested, ToolInvocationResulted וכו׳). זה עוזר לשחזר מצבים אחרי קריסה, לעקוב אחרי מה המשתמש עשה, ולתת יכולת Audit מלאה.

Stateful Processing
ה-Orchestrator וה-Aggregator מנהלים את מצב ה-Plan בזיכרון בעזרת אירועי Kafka. אם שירות נופל, אפשר פשוט לקרוא מחדש את האירועים ולשחזר את המצב בלי צורך ב-DB חיצוני.

CQRS ו-Idempotency
הפרדת Commands ו-Events ושמירה על Idempotency עוזרת למנוע בעיות כשאירועים מגיעים פעמיים או שירות נופל באמצע. כל Worker מתוכנן לעבד את אותו אירוע כמה פעמים בלי לגרום לשגיאה.

חסרונות Event Sourcing
הגישה מוסיפה קצת מורכבות, קשה יותר לבדוק מה קרה בדיוק, ויש סיכוי ל-Eventual Consistency – כלומר תוצאה סופית מתקבלת רק אחרי שכל האירועים עובדו.

שיפורים לעתיד
אפשר לשפר עם Kafka Streams, Schema Registry, KSQL ואמצעי ניתוח כמו Grafana/Prometheus כדי למדוד לייטנסי ו־Throughput בזמן אמת.

סיכום קצר
באופן כללי, הארכיטקטורה עמידה, מאפשרת שחזור, ומאוד מתאימה למערכות מבוזרות ואסינכרוניות עם הרבה Workers ו-Tools.
