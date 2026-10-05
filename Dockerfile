# syntax=docker/dockerfile:1

# Turnkey, self-contained deployment of the Triauth Authenticator:
# builds the static site, then serves it with Caddy (automatic HTTPS + hardened
# response headers). See the "Self-hosting" section of the README.
#
#   docker build -t triauth-authenticator .
#   docker run -e DOMAIN=auth.example.com -p 80:80 -p 443:443 triauth-authenticator

# ---- build stage: produce the static bundle ----
FROM node:22-alpine AS build
WORKDIR /app

# Install against the committed lockfile for a reproducible build.
COPY package.json package-lock.json ./
RUN npm ci

# Build the multi-page static app into /app/dist. The operator settings are baked in at build time.
# Pass them as --build-arg VITE_SERVED_DOMAINS=... / VITE_TERMS_OF_SERVICE_URL=... / VITE_PRIVACY_POLICY_URL=...
# (see the README's "Configuration" section).
ARG VITE_SERVED_DOMAINS
ARG VITE_TERMS_OF_SERVICE_URL
ARG VITE_PRIVACY_POLICY_URL
COPY . .
RUN npm run build

# ---- serve stage: Caddy serves the static files with hardened headers ----
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
