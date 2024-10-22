FROM node:16
WORKDIR /app
COPY package.json .
RUN yarn install
COPY . .
CMD ["node","/app/bin/server.js"]