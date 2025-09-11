# 1. Build stage
FROM node:24 AS build

# RUN git clone  https://github.com/ping-pub/explorer.git
WORKDIR /explorer
ARG GIT_REF=6d85f2f441749220a98b16f7df95c193c0e2a338

# Fetch only that commit (shallow) to keep the image small
RUN git init . \
    && git remote add origin https://github.com/ping-pub/explorer.git \
    && git fetch --depth=1 origin $GIT_REF \
    && git checkout --detach FETCH_HEAD
# COPY explorer/package.json explorer/yarn.lock ./
RUN yarn install
# COPY explorer/ .

# The installation guide mentions configuring chains.
# This part assumes you want to replace the default chain info with your own.
# First, remove the default chain configurations.
RUN rm -rf chains/mainnet/* chains/testnet/*
RUN rm -rf src/modules/[chain]/faucet/*
RUN rm -rf chains/*
RUN rm index.html
RUN rm public/favicon.ico
RUN rm public/logo.svg

COPY ./index.html ./index.html
COPY ./favicon.svg ./public/logo.svg
COPY ./favicon.ico ./public/favicon.ico

COPY nyks.json chains/mainnet/nyks.json
COPY nyks_testnet.json chains/testnet/nyks.json
COPY nyks_testnet.json chains/nyks.json
COPY ./faucet/index.vue src/modules/[chain]/faucet/index.vue
# RUN yarn build
RUN yarn --ignore-engines && yarn build
# 2. Serve stage
FROM nginx:stable-alpine
WORKDIR /app
# COPY --from=build /explorer /app/explorer
COPY --from=build /explorer/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
