FROM flink:1.17.0-scala_2.12

# 1. Install Python environment
RUN apt-get update -y && \
    apt-get install -y python3 python3-pip python3-dev && \
    rm -rf /var/lib/apt/lists/*

# 2. Cleanup old/broken Flink directories to prevent crashes
RUN rm -rf /opt/flink/plugins/bigquery-connector && \
    rm -f /opt/flink/lib/*bigquery*

# 3. Create the destination folder for your GCP key
RUN mkdir -p /opt/flink/usertools/

# 4. Copy files from your computer (ai-bot/) into the image
# This assumes gcp-key.json and the JARs are in your main 'ai-bot' folder
COPY gcp-key.json /opt/flink/usertools/gcp-key.json
COPY flink-1.17-connector-bigquery-1.1.0-shaded.jar /opt/flink/lib/
COPY flink-sql-connector-kafka-1.17.0.jar /opt/flink/lib/

# 5. Set correct ownership and permissions
RUN chown -R flink:flink /opt/flink/lib/ && \
    chown -R flink:flink /opt/flink/usertools/ && \
    chmod 755 /opt/flink/lib/*.jar && \
    chmod 644 /opt/flink/usertools/gcp-key.json
    
RUN pip install --no-cache-dir google-cloud-bigquery
# 6. Link Python and install Flink library
RUN ln -s /usr/bin/python3 /usr/bin/python && \
    pip3 install apache-flink==1.17.0