FROM node:20-alpine AS base

WORKDIR /app

COPY services/backend-node/package*.json ./
RUN npm install

COPY services/backend-node/ ./

EXPOSE 4000
CMD ["npm", "start"]
