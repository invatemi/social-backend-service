FROM docker.elastic.co/beats/filebeat:8.15.3

USER root
COPY config/filebeat.yml /usr/share/filebeat/filebeat.yml
RUN chown root:filebeat /usr/share/filebeat/filebeat.yml && chmod 640 /usr/share/filebeat/filebeat.yml
USER filebeat
