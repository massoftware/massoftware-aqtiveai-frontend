# Multi-stage build for Angular frontend
FROM node:22-alpine AS builder

# Install Python and build tools for native dependencies (lmdb required by Angular 18)
RUN apk add --no-cache python3 py3-pip make g++ && \
    ln -sf python3 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit --legacy-peer-deps

# Copy source code
COPY . .

# Rebuild native modules for Alpine Linux and build the application
RUN npm rebuild --verbose && \
    npm run build -- --configuration=production

# Production stage
FROM nginx:alpine

# Install curl for health check
RUN apk add --no-cache curl

# Copy built app to nginx
COPY --from=builder /app/dist/open-ai-web /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]