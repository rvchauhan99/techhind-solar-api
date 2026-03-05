FROM node:20-slim

# Install Chromium runtime shared libraries required by @sparticuz/chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Create uploads and temp directories
RUN mkdir -p /usr/src/app/public/uploads && \
    mkdir -p /tmp/uploads

# Copy package files
COPY package*.json ./

# Install dependencies (production only; migrations/sequelize-cli are in deps)
RUN npm ci --omit=dev

# Copy source code and project structure
COPY . .

RUN chmod +x /usr/src/app/docker-entrypoint.sh

# App default port (override with PORT env)
EXPOSE 5000

# Run migrations on startup, then start the server (fails deploy if migrations fail)
ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
