FROM docker.elastic.co/elasticsearch/elasticsearch:8.15.3

USER root
COPY config/elasticsearch.yml /usr/share/elasticsearch/config/elasticsearch.yml
COPY pipelines/microservices-logs.json /usr/share/elasticsearch/config/pipelines/microservices-logs.json
COPY scripts/docker-entrypoint-wrap.sh /usr/local/bin/docker-entrypoint-wrap.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-wrap.sh
USER elasticsearch

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-wrap.sh"]
