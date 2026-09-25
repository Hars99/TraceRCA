FROM node:20-alpine

WORKDIR /app

COPY apps/dashboard/package.json ./package.json
COPY apps/dashboard/package-lock.json ./package-lock.json
RUN npm ci

COPY apps/dashboard/tsconfig.json ./tsconfig.json
COPY apps/dashboard/next-env.d.ts ./next-env.d.ts
COPY apps/dashboard/app ./app
COPY apps/dashboard/components ./components
COPY apps/dashboard/lib ./lib

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]
