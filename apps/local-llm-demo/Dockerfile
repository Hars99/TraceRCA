FROM node:20-alpine
WORKDIR /app
COPY apps/local-llm-demo/package.json ./package.json
RUN npm install
COPY apps/local-llm-demo/tsconfig.json ./tsconfig.json
COPY apps/local-llm-demo/src ./src
RUN npx tsc
EXPOSE 3002
CMD ["node", "dist/index.js"]
