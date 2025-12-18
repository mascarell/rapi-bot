# Use the official Node.js 18 image as a base
FROM node:18

# Set the working directory in the container
WORKDIR /app

# Update apt-get and install FFmpeg + build tools for @discordjs/opus
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    libtool \
    autoconf \
    automake

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies including TypeScript and ts-node
RUN npm install
RUN npm install -g typescript ts-node

# Copy the rest of the application's source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the TypeScript application directly
CMD ["ts-node", "src/index.ts"]
