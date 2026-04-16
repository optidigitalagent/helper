FROM node:20-alpine

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src

RUN npx tsc

EXPOSE ${PORT:-3000}

CMD ["node", "dist/index.js"]
