FROM node:20-alpine AS deps
ARG API_PROXY_TARGET=http://localhost:4000
ENV API_PROXY_TARGET=$API_PROXY_TARGET
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
