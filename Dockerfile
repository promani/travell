# Travell: the PWA (static files) + the optional sync relay, in one small container.
FROM node:22-alpine
WORKDIR /app
COPY index.html manifest.webmanifest sw.js ./
COPY css ./css
COPY js ./js
COPY data ./data
COPY icons ./icons
COPY vendor ./vendor
COPY server ./server
ENV PORT=3000 SERVE_STATIC=/app RELAY_DATA=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server/relay.mjs"]
