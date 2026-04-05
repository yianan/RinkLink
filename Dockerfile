# Stage 1: Build React frontend
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_AUTH_ENABLED=true
RUN npm run build

# Stage 2: Build auth-service
FROM node:20-bookworm-slim AS auth-build
WORKDIR /auth-service
COPY auth-service/package*.json ./
RUN npm ci
COPY auth-service/ ./
RUN npm run build

# Stage 3: Combined runtime for backend + auth-service
FROM node:20-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /frontend/dist /app/backend/static

COPY auth-service/package.json /app/auth-service/package.json
COPY auth-service/scripts/ /app/auth-service/scripts/
COPY --from=auth-build /auth-service/dist /app/auth-service/dist
COPY --from=auth-build /auth-service/node_modules /app/auth-service/node_modules

COPY docker/start-single-service.sh /app/start-single-service.sh
RUN chmod +x /app/start-single-service.sh /app/auth-service/scripts/render-start.sh

EXPOSE 8000
CMD ["/app/start-single-service.sh"]
