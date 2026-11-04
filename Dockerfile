# ---- frontend ----
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY backend/internal/web/dist/.gitkeep /src/backend/internal/web/dist/.gitkeep
RUN npm run build

# ---- backend (embeds the frontend build) ----
FROM golang:1.25-alpine AS server
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=web /src/backend/internal/web/dist ./internal/web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /ppt-remote ./cmd/server

# ---- runtime: LibreOffice Impress for PPTX → PDF ----
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-impress fonts-dejavu fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 ppt-remote
USER ppt-remote
COPY --from=server /ppt-remote /usr/local/bin/ppt-remote
ENV PORT=8080
EXPOSE 8080
CMD ["ppt-remote"]
