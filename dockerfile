# Use the official Node.js 18 image as a base
FROM node:18

# Set the working directory in the container
WORKDIR /app

# Update apt-get and install FFmpeg + build tools for @discordjs/opus
# Also install dependencies required for Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    libtool \
    autoconf \
    automake \
    # Puppeteer dependencies for headless Chrome
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Copy package.json and bun lockfile
COPY package.json bun.lock ./

# Install dependencies with bun (TypeScript support built-in)
RUN bun install --frozen-lockfile

# Copy the rest of the application's source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the TypeScript application with bun
CMD ["bun", "run", "src/index.ts"]
