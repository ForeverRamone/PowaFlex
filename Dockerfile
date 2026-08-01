# ---- build frontend ----
FROM node:24-slim AS build
WORKDIR /app
# package-lock.json + npm ci = builds reproducibles (npm install podía resolver
# versiones distintas en cada build)
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
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
# web/package.json se copia aunque no se instale: npm ci valida el árbol de
# workspaces completo contra el lock antes de instalar solo el de server
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=server --no-audit --no-fund
COPY server server
COPY --from=build /app/web/dist web/dist
# el proceso no corre como root; solo DATA_DIR necesita ser escribible, /app se
# lee tal cual (con un bind mount manda el propietario del host: ver compose)
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
EXPOSE 3860
USER node
# endpoint sin credenciales (queda fuera de POWAFLEX_AUTH a propósito)
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3860)+'/api/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
