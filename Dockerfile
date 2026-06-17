# Stage 1 — build the React frontend (Vite bakes REACT_APP_* from .env.production)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

# Stage 2 — runtime: boardgame.io server + static build output
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional
COPY src ./src
COPY --from=build /app/build ./build
EXPOSE 9119
CMD ["node", "src/server.js"]
