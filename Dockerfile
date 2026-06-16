FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# --- Production stage ---
FROM node:22-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install dependencies needed for the app and first-deploy schema setup
RUN pnpm install --frozen-lockfile

# Copy schema files required by the Railway pre-deploy command
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Expose port (configurable via PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/healthz || exit 1

# Start the production server
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
