FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /data
VOLUME /data

EXPOSE 3002

CMD ["node", "src/storage-service/server.js"] 