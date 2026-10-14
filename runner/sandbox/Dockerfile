FROM python:3.12-alpine
RUN apk upgrade --no-cache && pip install --no-cache-dir ruff==0.17.0 && pip uninstall -y pip
RUN adduser -D -u 10001 learner
USER 10001:10001
WORKDIR /tmp
