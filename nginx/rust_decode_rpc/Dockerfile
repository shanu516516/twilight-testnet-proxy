FROM rust:1.87.0 as builder 

RUN USER=root apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install git curl g++ build-essential libssl-dev pkg-config && \
    apt-get -y install software-properties-common && \
    apt-get update


WORKDIR /decoder_rpc
COPY . .
RUN cargo build --release


FROM rust:1.87.0
RUN apt-get update && apt-get install -y ca-certificates curl libpq-dev libssl-dev

WORKDIR /app
COPY --from=builder ./decoder_rpc/target/release/twilight-rpc-decoder ./
EXPOSE 8080
ENTRYPOINT ["/app/twilight-rpc-decoder"]