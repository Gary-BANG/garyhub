ARG BASE_IMAGE=garyhub-calendar:6cd3102
FROM ${BASE_IMAGE}
WORKDIR /lab
COPY server.cjs ./
COPY public ./public
ENV PORT=3000 LAB_DATA_DIR=/data
CMD ["node", "/lab/server.cjs"]
