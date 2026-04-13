# Stage 1: Build the frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Single container — Playwright (Jammy) + PocketBase + Node worker
FROM mcr.microsoft.com/playwright:v1.58.2-jammy
ARG PB_VERSION=0.22.22

RUN apt-get update && apt-get install -y --no-install-recommends wget unzip ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install PocketBase
RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    -O /tmp/pb.zip && \
    unzip /tmp/pb.zip -d /pb && \
    rm /tmp/pb.zip && \
    chmod +x /pb/pocketbase

# Copy frontend build
COPY --from=frontend-builder /app/dist /pb/pb_public

# Copy PocketBase entrypoint and migrations
COPY pocketbase/entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh
COPY pocketbase/pb_migrations/ /pb/pb_migrations/

# Install Node worker dependencies
WORKDIR /worker
COPY worker/package.json ./
RUN npm install
COPY worker/src/ ./src/

# Copy supervisor entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8090
ENTRYPOINT ["/entrypoint.sh"]
