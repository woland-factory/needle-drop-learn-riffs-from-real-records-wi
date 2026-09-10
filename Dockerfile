# Build the static SPA.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve it with nginx. Runtime config.js is generated from env at start.
FROM nginx:1.27-alpine
ENV SENTRY_DSN="" \
    UMAMI_WEBSITE_ID="" \
    UMAMI_URL=""
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/99-needle-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/99-needle-config.sh
EXPOSE 80
# nginx:alpine's own entrypoint runs every /docker-entrypoint.d/*.sh, then nginx.
