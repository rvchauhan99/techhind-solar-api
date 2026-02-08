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

# Set ownership of all files to pptruser
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to pptruser for running the app
USER pptruser

# App default port (override with PORT env)
EXPOSE 5000

# Run migrations then start the server (no npm install at runtime)
CMD ["sh", "-c", "npm run db:migrate && node src/server.js"]
