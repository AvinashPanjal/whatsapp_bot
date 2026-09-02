# Use Node 20 Debian slim base image
FROM node:20-slim

# Install Chromium and native dependencies for Puppeteer headless browser
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Skip downloading Puppeteer's default Chrome and use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source files
COPY . .

# Expose port (Render and Railway set the PORT environment variable)
EXPOSE 3000

CMD ["node", "index.js"]
