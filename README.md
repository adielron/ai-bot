🛠️ Execution Instructions
        To run the complete pipeline, follow these steps in order. Ensure you have your Google Cloud credentials (service-account-key.json) in the project root.

        1. Start Infrastructure
        Launch the Kafka brokers, Zookeeper, and Flink JobManager/TaskManager:

        Bash
        docker compose up -d

2.       the Backend Services (Node.js/Bun)
        Open two separate terminals for the agent logic:

        Terminal A: Agent Orchestrator (Listens to Kafka and manages the plan):

        Bash
        bun run services/consumer.ts
        Terminal B: Input Producer (Simulates user messages into the user-input-event topic):

        Bash
        bun run services/producer.ts


3.      Start the Stream Processor (PyFlink & BigQuery)
        This service performs the real-time sentiment analysis and streams data to BigQuery.

        Terminal C: Flink SQL & Python UDF:

        Bash
        # Ensure you are in your virtual environment if applicable
        python services/flink_processor.py


📊 Performance BenchmarkingScenarioModelAvg Latency (ms)Throughput (Events/sec)Precision (1-5)CostRouter (Plan Gen)Llama3 (8B)250–400 ms~3–54$0Router (Fallback)GPT-3.5600–900 ms~1–25$OrchestratorNode/TS10–30 ms~500N/A$0RAG RetrievalHF Embeddings120–250 ms~10–155$0BigQuery IngestionPyFlink Sink~50 ms300+N/A$

🏗️ Data Architecture & Medallion Flow
Kafka (Bronze): Acts as the immutable Event Store.

Flink (Silver): Enriches data with AI Sentiment and structural normalization.

BigQuery (Gold): Stores the final, queryable insights for BI and Audit.

🛡️ Security & Git
The project is configured to ignore sensitive artifacts:

*.jar: Compiled Flink/Java binaries.

*.json: GCP Credentials (excluding history.json via the !history.json exception)


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

