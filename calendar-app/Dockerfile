FROM node:20-bookworm-slim

WORKDIR /app

# 安装 sqlite3 原生模块编译所需依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./

# 强制从源码编译 sqlite3，避免预编译二进制的 glibc 不匹配
RUN npm install --build-from-source

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
