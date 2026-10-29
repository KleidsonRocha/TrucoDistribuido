FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS game
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY server ./server
COPY shared ./shared
COPY src/rules.ts ./src/rules.ts
USER node
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "server/index.ts"]

FROM game AS frontend
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "server/gateway.ts"]
