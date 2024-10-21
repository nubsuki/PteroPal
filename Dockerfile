# Use the official Node.js image
FROM node:lts-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json if you have one
COPY package.json ./

# Install the required Node.js packages
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Command to run the bot
CMD ["node", "app.js"]
