FROM python:3.14-slim
RUN apt-get update && apt-get install -y --no-install-recommends bash git ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home agent
WORKDIR /app/agent-service
COPY agent-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY agent-service/app ./app
COPY agent-service/run.py ./run.py
ENV AGENT_HOST=0.0.0.0 AGENT_PORT=9801 PYTHONUNBUFFERED=1
USER agent
EXPOSE 9801
CMD ["python","run.py"]
