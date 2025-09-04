FROM node:18.20-slim  
ENV PNPM_HOME=/usr/local/share/pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate
WORKDIR /app
RUN USER=root apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install git
RUN ls
RUN ls -a
RUN ls -a
RUN ls -a
RUN ls -a
RUN git clone -b dev https://github.com/kenny019/twilight-pool.git
WORKDIR /app/twilight-pool

RUN pnpm install
# RUN pnpm install --frozen-lockfile --prod=false
COPY .env.frontend .env
RUN pnpm run build
EXPOSE 3000
CMD [ "pnpm", "start" ]