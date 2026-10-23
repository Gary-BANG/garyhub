ARG BASE_IMAGE=garyhub-calendar:6cd3102
FROM ${BASE_IMAGE}
WORKDIR /lab
COPY server.cjs ./
COPY access-store.cjs lab-distribution.cjs ./
COPY access-connection.cjs ./
COPY academic.cjs homepage-privacy.cjs user-cleanup.cjs ./
# Restore private homepage JSON files separately from restricted backups; never commit them.
COPY public ./public
ENV PORT=3000 LAB_DATA_DIR=/data
CMD ["node", "/lab/server.cjs"]

