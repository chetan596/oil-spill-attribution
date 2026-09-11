FROM node:20-alpine
WORKDIR /app
COPY services/backend-node/package*.json ./
RUN npm install --production
COPY services/backend-node/ .
EXPOSE 4000
CMD ["npm", "start"]
