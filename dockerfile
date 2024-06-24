# Use the official Node.js 18 image as a base
FROM node:latest

# Set the working directory in the container
WORKDIR /app

# Update apt-get and install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Copy the package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
# We install PM2 globally in the container to manage our application
RUN npm install --only=production && npm install pm2 -g

# Copy the rest of the application's source code
COPY . .

# Expose the port the app runs 
# Assuming 3000 is the default port for this app. Change if not.
EXPOSE 3000

# Command to run the application using PM2
CMD ["pm2-runtime", "index.js"]
