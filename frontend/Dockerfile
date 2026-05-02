# syntax=docker/dockerfile:1
# Build static assets (Vite), serve SPA with `serve` (Node only — no nginx)
FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=http://localhost:3000
ARG VITE_ONESIGNAL_APP_ID=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ONESIGNAL_APP_ID=$VITE_ONESIGNAL_APP_ID

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY index.html vite.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build && rm -rf node_modules

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init && \
    npm install -g serve@14 && npm cache clean --force && \
    addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
COPY --from=builder --chown=app:app /app/dist ./dist
USER app
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:3000"]
