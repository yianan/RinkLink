# RinkLink — Frontend

React + TypeScript + Vite frontend for the RinkLink youth hockey scheduling app.

## Dev

```bash
npm install
npm run dev
```

Vite starts on `http://localhost:5173` and proxies all `/api` requests to `http://localhost:8000`. See the [root README](../README.md) for full setup instructions.

## Build

```bash
npm run build
```

The `dist/` output is copied into the Docker image and served as static files by FastAPI in production.
