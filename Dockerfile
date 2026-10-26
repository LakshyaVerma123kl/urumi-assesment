FROM node:20-slim

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install dependencies for all services
COPY woocommerce-mcp-server/package*.json ./woocommerce-mcp-server/
RUN cd woocommerce-mcp-server && npm install --production

COPY time-mcp-server/package*.json ./time-mcp-server/
RUN cd time-mcp-server && npm install --production

COPY calculator-mcp-server/package*.json ./calculator-mcp-server/
RUN cd calculator-mcp-server && npm install --production

COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy source files
COPY woocommerce-mcp-server/ ./woocommerce-mcp-server/
COPY time-mcp-server/ ./time-mcp-server/
COPY calculator-mcp-server/ ./calculator-mcp-server/
COPY backend/ ./backend/
COPY start-cloud.sh ./start-cloud.sh

RUN chmod +x ./start-cloud.sh

# Expose ports (Gateway is public on $PORT, others are internal)
EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3001}/health || exit 1

CMD ["./start-cloud.sh"]
