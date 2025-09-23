FROM node:20-slim

# Chromium için bağımlılıklar
RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libnspr4 \
  libnss3 \
  libx11-6 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxrandr2 \
  xdg-utils \
  wget \
  && rm -rf /var/lib/apt/lists/*

# Çalışma dizini
WORKDIR /usr/src/app

# Package.json dosyaları
COPY package*.json ./

RUN npm install --production

# Uygulama dosyaları
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
