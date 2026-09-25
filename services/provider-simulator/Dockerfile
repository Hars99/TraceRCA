FROM node:20-alpine

WORKDIR /app

# Copy only what this service needs
COPY services/provider-simulator/package.json ./package.json
RUN npm install

COPY services/provider-simulator/tsconfig.json ./tsconfig.json
COPY services/provider-simulator/src ./src

RUN npx tsc

EXPOSE 4001

CMD ["node", "dist/index.js"]
