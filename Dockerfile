# Kinggold dashboard (Next.js, npm). Multi-stage: `dev` and `prod`.
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# ---- dev: hot reload, code bind-mounted ----
FROM base AS dev
RUN npm install
EXPOSE 3000
CMD ["npx", "next", "dev", "-H", "0.0.0.0"]

# ---- build ----
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# ---- prod runtime ----
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
