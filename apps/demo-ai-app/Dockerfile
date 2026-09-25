FROM node:20-alpine

WORKDIR /app

# Copy only what this app needs
COPY apps/demo-ai-app/package.json ./package.json
RUN npm install

COPY apps/demo-ai-app/tsconfig.json ./tsconfig.json
COPY apps/demo-ai-app/src ./src

RUN npx tsc

EXPOSE 3001

CMD ["node", "dist/index.js"]
