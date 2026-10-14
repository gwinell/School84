FROM python:3.12-alpine
RUN pip install --no-cache-dir ruff==0.17.0
RUN adduser -D -u 10001 learner
USER 10001:10001
WORKDIR /tmp
