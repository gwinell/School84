FROM python:3.12-alpine
RUN apk upgrade --no-cache && apk add --no-cache nodejs npm && npm install --global --omit=dev eslint@9.39.5 && npm cache clean --force && pip install --no-cache-dir ruff==0.17.0 && pip uninstall -y pip
RUN adduser -D -u 10001 learner
USER 10001:10001
WORKDIR /tmp
