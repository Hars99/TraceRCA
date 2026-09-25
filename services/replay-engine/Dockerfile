FROM node:20-alpine

WORKDIR /app

# --- contracts ---
# Copy and build contracts so dist/ exists before npm install resolves the file: dep
COPY packages/contracts ./packages/contracts

WORKDIR /app/packages/contracts
RUN npm install && npm run build

# --- replay-engine ---
# Mirror repo layout so file:../../packages/contracts resolves correctly:
#   /app/services/replay-engine/../../packages/contracts
#   = /app/packages/contracts  ✓
WORKDIR /app/services/replay-engine

COPY services/replay-engine/package.json ./package.json
RUN npm install

COPY services/replay-engine/tsconfig.json ./tsconfig.json
COPY services/replay-engine/src ./src

RUN npx tsc

EXPOSE 4003

# dist/index.js is relative to the WORKDIR /app/services/replay-engine
CMD ["node", "dist/index.js"]
