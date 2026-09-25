FROM node:20-alpine

WORKDIR /app

COPY apps/tracerca-api/package.json ./package.json
RUN npm install

COPY apps/tracerca-api/tsconfig.json ./tsconfig.json
COPY apps/tracerca-api/src ./src

RUN npx tsc

EXPOSE 4004

CMD ["node", "dist/index.js"]
