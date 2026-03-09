# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (production + dev, needed for build)
COPY package*.json ./
RUN npm ci

# Copy source and build the Vite frontend
COPY . .
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built frontend and server files from the builder
COPY --from=builder /app/dist ./dist
COPY server.js ./
COPY middleware ./middleware
COPY server ./server
COPY utils ./utils

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server.js"]
