import logging
import datetime
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.table import StreamTableEnvironment, DataTypes
from pyflink.table.window import Tumble
from pyflink.table.expressions import col, lit, current_timestamp, call_sql
from pyflink.table.udf import ScalarFunction, udf
from pyflink.common import Configuration
from google.cloud import bigquery
from pyflink.common.typeinfo import Types
from pyflink.datastream.functions import SinkFunction, RuntimeContext
from pyflink.datastream.functions import MapFunction
from datetime import datetime
# --- 1. GLOBAL DEFINITIONS (UDFs and Sinks) ---

class ConversationContext(ScalarFunction):
    def __init__(self):
        self.history = {} 

    def eval(self, conversation_id, current_msg):
        prev_msg = self.history.get(conversation_id, "None")
        self.history[conversation_id] = current_msg
        print(f"DEBUG [UDF]: Processing ID {conversation_id}")
        return f"Context: [Prev: {prev_msg}] -> Current: {current_msg.upper()}"

get_context = udf(ConversationContext(), result_type=DataTypes.STRING())

# Define the Sink Class here at the top level
class BigQuerySink(SinkFunction):
    def __init__(self):
        # We don't call super().__init__() here to avoid the 'sink_func' error
        pass

    def invoke(self, row, context):
        try:
            from google.cloud import bigquery
            # Initialize client inside invoke for worker-safety
            client = bigquery.Client.from_service_account_json('/opt/flink/usertools/gcp-key.json')
            table_id = "ai-bot-487419.ai_bot_data.processed_events"
            
            data = {
                "user_id": row[0],
                "user_msg": row[1],
                "ai_sentiment": row[2],
                "processing_time": row[3].isoformat() if row[3] else None
            }
            
            errors = client.insert_rows_json(table_id, [data])
            if errors:
                print(f"❌ BQ Error: {errors}")
            else:
                print(f"🚀 BQ Success: {row[1][:30]}")
        except Exception as e:
            print(f"💥 Sink Runtime Error: {e}")
# --- 2. MAIN JOB FUNCTION ---

def run_flink_job():
    print("🚀 Initializing Flink Environment...")
    
    config = Configuration()
    config.set_string("taskmanager.numberOfTaskSlots", "4")
    config.set_string("parallelism.default", "1")
    config.set_string("flink.netty.ssl.provider", "JDK")
    config.set_string("env.java.opts", "-Dorg.conscrypt.native.enabled=false")

    config.set_string("taskmanager.memory.task.off-heap.size", "512mb")


    env = StreamExecutionEnvironment.get_execution_environment(config)
    t_env = StreamTableEnvironment.create(env)

    t_env.get_config().set_python_executable("python3")
    t_env.get_config().get_configuration().set_boolean("python.fn-execution.pickle.allow-init-main", True)
    t_env.get_config().get_configuration().set_string("execution.checkpointing.interval", "10s")

    print("📡 Defining Kafka Source...")
    t_env.execute_sql("""
        CREATE TABLE source_table (
            eventType STRING,
            conversationId STRING,
            `timestamp` BIGINT,
            payload STRING,
            ts_ltz AS TO_TIMESTAMP_LTZ(`timestamp`, 3),
            WATERMARK FOR ts_ltz AS ts_ltz - INTERVAL '5' SECOND
        ) WITH (
            'connector' = 'kafka',
            'topic' = 'user-input-event',
            'properties.bootstrap.servers' = 'kafka:29092',
            'properties.group.id' = 'flink-ai-bot-group',
            'scan.startup.mode' = 'earliest-offset',  -- This solves the "NoOffsetForPartitionException"
            'format' = 'json'
        )
    """)

    print("🖨️  Setting up Print and Kafka Sinks...")
    t_env.execute_sql("CREATE TABLE sink_table (clean_query STRING) WITH ('connector' = 'kafka', 'topic' = 'clean-queries', 'properties.bootstrap.servers' = 'kafka:29092', 'format' = 'json')")
    t_env.execute_sql("CREATE TABLE print_main (clean_query STRING) WITH ('connector' = 'print', 'print-identifier' = 'MAIN_FLOW')")
    t_env.execute_sql("CREATE TABLE print_window (conversationId STRING, msg_count BIGINT) WITH ('connector' = 'print', 'print-identifier' = 'WINDOW_STATS')")

    print("⚙️  Applying Processing Logic...")
    source_tab = t_env.from_path("source_table")

    result_table = source_tab \
        .filter(call_sql("CHAR_LENGTH(payload) > 2")) \
        .select(get_context(col("conversationId"), col("payload")).alias("clean_query"))

    windowed_stats = source_tab \
        .window(Tumble.over(lit(10).seconds).on(col("ts_ltz")).alias("w")) \
        .group_by(col("w"), col("conversationId")) \
        .select(col("conversationId"), col("payload").count.alias("msg_count"))

    final_output_table = result_table.select(
        lit("anonymous_user").alias("user_id"),
        col("clean_query").alias("user_msg"),
        lit("neutral").alias("ai_sentiment"),
        current_timestamp().alias("processing_time")
    )

   # --- 4. THE BIGQUERY BRIDGE (DataStream) ---
    print("🌉 Bridging Table API to DataStream for BigQuery...")
    ds_type_info = Types.ROW([
            Types.STRING(),         # user_id
            Types.STRING(),         # user_msg
            Types.STRING(),         # ai_sentiment
            Types.SQL_TIMESTAMP()   # processing_time
        ])
    
    bigquery_ds = t_env.to_append_stream(final_output_table, ds_type_info)

    # --- 5. THE DATA INSERTION (Simplified) ---
    
    # Use .map() to trigger the Python logic
    
    class BigQueryInsertMap(MapFunction):
        def __init__(self, key_path, table_id):
            # Store strings only - these serialize easily
            self.key_path = key_path
            self.table_id = table_id
            self.client = None

        def open(self, runtime_context):
            # 1. Import inside open to avoid serialization issues
            from google.cloud import bigquery
            from google.oauth2 import service_account
            
            # 2. Initialize the client ON THE WORKER
            credentials = service_account.Credentials.from_service_account_file(self.key_path)
            self.client = bigquery.Client(credentials=credentials, project=credentials.project_id)

        def map(self, row):
            try:
                # We must use the EXACT names from your BigQuery screenshot
                row_dict = {
                    "user_id": row[0],
                    "user_msg": row[1],
                    "ai_sentiment": row[2],      # Match 'ai_sentiment' from your image
                    "processing_time": row[3]    # Match 'processing_time' from your image
                }

                # Handle the timestamp conversion for 'processing_time'
                if hasattr(row_dict['processing_time'], 'isoformat'):
                    row_dict['processing_time'] = row_dict['processing_time'].isoformat()

                # Perform the insert
                errors = self.client.insert_rows_json(self.table_id, [row_dict])
                
                if errors:
                    print(f"BigQuery Logic Error: {errors}")
                else:
                    print(f"Success! Data sent for user: {row_dict['user_id']}")
                    
            except Exception as e:
                print(f"Python Map Error: {e}")

            return row






    processed_bq_ds = bigquery_ds.map(
        BigQueryInsertMap(
            '/opt/flink/usertools/gcp-key.json', 
            'ai-bot-487419.ai_bot_data.processed_events'
        ), 
        output_type=ds_type_info
    )
    
    # 2. Add a sink to the DataStream (Crucial: Streams must have a termination point)
    processed_bq_ds.print(sink_identifier="BQ_SINK_CONFIRMATION")


    print("🔗 Merging Table logic into DataStream...")
    statement_set = t_env.create_statement_set()
    statement_set.add_insert("sink_table", result_table)
    statement_set.add_insert("print_main", result_table)
    statement_set.add_insert("print_window", windowed_stats)
    
    # 3. This moves everything from statement_set into 'env'
    statement_set.attach_as_datastream()

    print("🏁 Submitting unified Job to cluster...")
    
    # 4. Use env.execute() because the Table logic now lives here
    env.execute("AI Bot Integrated Stream")

if __name__ == '__main__':
    run_flink_job()