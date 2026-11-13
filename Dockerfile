# Co-op server image (Fly.io, or any container host). Serves the built game and /ws on $PORT.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npx vite build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 TRUST_PROXY=1 ALLOWED_ORIGINS=https://lemon192038.github.io
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY src/net/hitcheck.js ./src/net/hitcheck.js
COPY --from=build /app/dist ./dist
EXPOSE 8080
USER node
CMD ["node", "server/server.js"]
