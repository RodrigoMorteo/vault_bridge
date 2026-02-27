# To build this container locally (and add it locally) run: 
# docker build -t bws-vault-bridge:latest . 
# Stage 1: Build
FROM node:lts-slim AS builder
WORKDIR /app

# Install dependencies (including devDependencies for build scripts)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Prune dev dependencies for production
RUN npm prune --omit=dev

# Stage 2: Runtime
FROM node:lts-slim

# Install ca-certificates for HTTPS (required by rustls)
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/src ./src

# Create a non-root user for security (node image provides 'node' user)
USER node

# Default port can be overridden at build time or runtime
ENV PORT=3000

# Expose the application port
EXPOSE $PORT

# Command to run the application
CMD ["node", "index.js"]
