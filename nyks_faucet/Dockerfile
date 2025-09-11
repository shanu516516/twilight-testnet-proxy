FROM node:16 AS build

WORKDIR /faucet

COPY ./faucet/package.json ./package.json
RUN npm install
COPY ./faucet/ .
RUN rm  ./config.js
COPY ./config.js ./config.js

CMD ["npm", "run", "start"]

# FROM nginx:stable-alpine
# WORKDIR /app
# COPY ./nginx.conf /etc/nginx/nginx.conf
# COPY --from=build /faucet/dist /app
# COPY --from=build /faucet/node_modules /app/node_modules