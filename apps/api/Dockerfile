FROM python:3.11-slim

WORKDIR /repo

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/repo

COPY galaxygen galaxygen
COPY pyproject.toml pyproject.toml
COPY README.md README.md
COPY apps/api/requirements.txt apps/api/requirements.txt
RUN pip install --no-cache-dir -r apps/api/requirements.txt
COPY apps/api/app apps/api/app
COPY data/assets data/assets

WORKDIR /repo/apps/api

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
