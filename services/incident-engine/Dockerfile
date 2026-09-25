FROM node:20-alpine

WORKDIR /app

COPY services/incident-engine/package.json ./package.json
RUN npm install

COPY services/incident-engine/tsconfig.json ./tsconfig.json
COPY services/incident-engine/src ./src

RUN npx tsc

EXPOSE 4002

CMD ["node", "dist/index.js"]
