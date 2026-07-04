# ---- build frontend ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --no-audit --no-fund
COPY web web
RUN npm run build --workspace=web

# ---- runtime ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3860
COPY package.json ./
COPY server/package.json server/
RUN npm install --omit=dev --workspace=server --no-audit --no-fund
COPY server server
COPY --from=build /app/web/dist web/dist
VOLUME /data
EXPOSE 3860
CMD ["node", "server/src/index.js"]
