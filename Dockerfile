FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm install --ignore-scripts

# Copy source files
COPY src ./src

# Build TypeScript
RUN npx tsc

# Remove dev dependencies
RUN npm prune --production

# Expose port
EXPOSE 3000

# Set default environment
ENV PORT=3000
ENV NODE_ENV=production

# Run the HTTP server
CMD ["node", "dist/server-http.js"]
