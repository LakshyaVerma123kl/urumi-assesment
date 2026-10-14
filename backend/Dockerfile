FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Create data directory
RUN mkdir -p /app/data

# Copy source code and charts
COPY src/ ./src/
COPY charts/ ./charts/

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "src/server.js"]
