FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source and build
COPY tsconfig.json ./
COPY src ./src

# Install dev dependencies for build, then remove
RUN npm install && npm run build && npm prune --production

# Expose port
EXPOSE 3000

# Set default environment
ENV PORT=3000
ENV NODE_ENV=production

# Run the HTTP server
CMD ["node", "dist/server-http.js"]
