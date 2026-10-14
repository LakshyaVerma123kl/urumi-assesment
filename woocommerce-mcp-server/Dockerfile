FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src/ ./src/

EXPOSE 3002

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3002/health || exit 1

CMD ["node", "src/server.js"]
