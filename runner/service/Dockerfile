FROM python:3.12-alpine
WORKDIR /service
COPY requirements.txt .
RUN apk upgrade --no-cache && pip install --no-cache-dir -r requirements.txt && pip uninstall -y pip
COPY main.py .
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
