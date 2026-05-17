FROM python:3.11-slim

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1

RUN pip install streamlit requests

COPY main.py .
COPY box_canvas_component ./box_canvas_component

EXPOSE 8501

CMD ["streamlit", "run", "main.py", "--server.port=8501", "--server.address=0.0.0.0", "--client.toolbarMode=minimal"]
