FROM node:20-alpine

WORKDIR /app

COPY server.js /app/server.js

ENV PORT=3000
ENV DATA_FILE=/data/tasks.json

EXPOSE 3000

CMD ["node", "server.js"]
