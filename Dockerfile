FROM flink:1.17.0-scala_2.12

# Install Python
RUN apt-get update -y && \
    apt-get install -y python3 python3-pip python3-dev && \
    rm -rf /var/lib/apt/lists/*

# Download the Kafka Connector JAR directly into Flink's lib folder
# This is the "Translator" Flink was complaining about
RUN wget -P /opt/flink/lib/ https://repo.maven.apache.org/maven2/org/apache/flink/flink-sql-connector-kafka/1.17.0/flink-sql-connector-kafka-1.17.0.jar

RUN ln -s /usr/bin/python3 /usr/bin/python && \
    pip3 install apache-flink==1.17.0