# 1. Use the official lightweight Node.js Linux image as our base environment
FROM node:18-alpine

# 2. Set the working directory inside the container's isolated filesystem
WORKDIR /usr/src/app

# 3. Copy application dependency records first (optimises build caching)
COPY package*.json ./

# 4. Install production dependencies only (skips dev tools, keeps image tiny)
RUN npm ci --only=production

# 5. Copy the rest of your application code (server.js, payflow.yaml) into the container
COPY . .

# 6. Inform Docker that the container will listen on port 3000 at runtime
EXPOSE 3000

# 7. Define the default engine command to boot the web application
CMD ["node", "server.js"]