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
LABEL org.opencontainers.image.title="PowaFlex" \
      org.opencontainers.image.description="Dashboard de gestión de cine para Plex: estadísticas, completismo de filmografías (TMDB), calendario de estrenos y envío a Radarr." \
      org.opencontainers.image.source="https://github.com/ForeverRamone/PowaFlex" \
      org.opencontainers.image.licenses="MIT" \
      net.unraid.docker.icon="https://raw.githubusercontent.com/ForeverRamone/PowaFlex/main/assets/icon.png" \
      net.unraid.docker.webui="http://[IP]:[PORT:3860]"
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
