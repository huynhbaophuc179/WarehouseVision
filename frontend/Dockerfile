FROM python:3.11-slim

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1

RUN pip install streamlit requests streamlit-drawable-canvas==0.9.3

COPY main.py .

EXPOSE 8501

CMD ["streamlit", "run", "main.py", "--server.port=8501", "--server.address=0.0.0.0"]
