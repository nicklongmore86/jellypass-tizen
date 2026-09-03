FROM node:22-alpine

WORKDIR /app
COPY bridge/bridge.html bridge/server.mjs ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
