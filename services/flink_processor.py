import logging
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.table import StreamTableEnvironment, DataTypes
from pyflink.table.window import Tumble
from pyflink.table.expressions import col, lit
from pyflink.table.udf import ScalarFunction, udf
from pyflink.table.expressions import call_sql  # Add this import at the top

# 1. Define the State-aware UDF
class ConversationContext(ScalarFunction):
    def __init__(self):
        self.history = {} 

    def eval(self, conversation_id, current_msg):
        # This print happens inside the TaskManager logs!
        prev_msg = self.history.get(conversation_id, "None")
        print(f"DEBUG [UDF]: Processing ID {conversation_id}. Previous was: {prev_msg}")
        
        self.history[conversation_id] = current_msg
        return f"Context: [Prev: {prev_msg}] -> Current: {current_msg.upper()}"

get_context = udf(ConversationContext(), result_type=DataTypes.STRING())

def run_flink_job():
    logging.basicConfig(level=logging.INFO)
    print("🚀 Flink is warming up... Prepare for logs!")

    env = StreamExecutionEnvironment.get_execution_environment()
    t_env = StreamTableEnvironment.create(env)

    # 2. Source Table
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
            'properties.group.id' = 'flink-bot-group',
            'scan.startup.mode' = 'latest-offset',
            'format' = 'json'
        )
    """)

    # 3. Create MULTIPLE Print Sinks for Debugging
    t_env.execute_sql("""
        CREATE TABLE sink_table (clean_query STRING) 
        WITH ('connector' = 'kafka', 'topic' = 'clean-queries', 'properties.bootstrap.servers' = 'kafka:29092', 'format' = 'json')
    """)

    # This sink is for Feature 1 & 2 (Individual messages)
    t_env.execute_sql("CREATE TABLE print_main (clean_query STRING) WITH ('connector' = 'print', 'print-identifier' = 'MAIN_FLOW')")
    
    # This sink is for Feature 3 (The Spam/Window stats)
    # Note: We need to define columns that match our windowed_stats table
    t_env.execute_sql("""
        CREATE TABLE print_window (
            conversationId STRING, 
            msg_count BIGINT
        ) WITH ('connector' = 'print', 'print-identifier' = 'WINDOW_STATS')
    """)

    # --- PROCESSING ---
    source_tab = t_env.from_path("source_table")

    # Flow 1: Context & Filtering
    result_table = source_tab \
        .filter(call_sql("CHAR_LENGTH(payload) > 2")) \
        .select(get_context(col("conversationId"), col("payload")).alias("clean_query"))

    # Flow 2: Windowing (Spam Detection)
    windowed_stats = source_tab \
        .window(Tumble.over(lit(10).seconds).on(col("ts_ltz")).alias("w")) \
        .group_by(col("w"), col("conversationId")) \
        .select(col("conversationId"), col("payload").count.alias("msg_count"))

    # 4. EXECUTION
    print("✅ Logic loaded. Sending data to terminal...")
    
    statement_set = t_env.create_statement_set()
    
    # Send main flow to Kafka and Print
    statement_set.add_insert("sink_table", result_table)
    statement_set.add_insert("print_main", result_table)
    
    # Send windowed stats to the new Window Print sink
    statement_set.add_insert("print_window", windowed_stats)
    
    statement_set.execute()

if __name__ == '__main__':
    run_flink_job()