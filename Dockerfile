FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
USER node
ENV HOST=0.0.0.0 PORT=4173
EXPOSE 4173
CMD ["node", "scripts/serve.mjs"]
