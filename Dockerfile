FROM ghcr.io/puppeteer/puppeteer:22.0.0

# Switch to root to set up directories and permissions
USER root

WORKDIR /usr/src/app

# Create uploads and temp directories (app uses public/uploads; Puppeteer uses /tmp)
RUN mkdir -p /usr/src/app/public/uploads && \
    mkdir -p /tmp/uploads && \
    chown -R pptruser:pptruser /usr/src/app && \
    chown -R pptruser:pptruser /tmp/uploads

# Copy package files
COPY package*.json ./

# Install dependencies (production only; migrations/sequelize-cli are in deps)
RUN npm ci --omit=dev

# Copy source code and project structure
COPY . .

# Set ownership of all files to pptruser; entrypoint must be executable
RUN chown -R pptruser:pptruser /usr/src/app && chmod +x /usr/src/app/docker-entrypoint.sh

# Switch back to pptruser for running the app
USER pptruser

# App default port (override with PORT env)
EXPOSE 5000

# Run migrations on startup, then start the server (fails deploy if migrations fail)
ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
