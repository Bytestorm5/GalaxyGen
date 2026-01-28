Asarto API
==========

Local dev
---------
Run the API directly (expects MONGO_URI in your environment or deploy/.env):

```
uvicorn app.main:app --port 8000 --reload
```

Docker container
----------------
Build from the repo root (Dockerfile lives in apps/api):

```
docker build -f apps/api/Dockerfile -t asarto-api .
```

Run the container (MongoDB must be reachable):

```
docker run --rm -p 8000:8000 ^
  -e MONGO_URI="mongodb://host.docker.internal:27017/galaxygen" ^
  -e MONGO_DB="galaxygen" ^
  asarto-api
```

Notes
-----
- The API requires MONGO_URI to start.
- If you are using Docker Compose, ensure the api service has MONGO_URI set and a mongo service is running.
