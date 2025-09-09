FROM rust:1.87.0 as builder 

RUN USER=root apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install git curl g++ build-essential libssl-dev pkg-config && \
    apt-get -y install software-properties-common && \
    apt-get update

RUN git clone https://github.com/shanu516516/nyks_tx_decoder.git

WORKDIR /nyks_tx_decoder
RUN cargo build --release


FROM rust:1.87.0
RUN apt-get update && apt-get install -y ca-certificates curl libpq-dev libssl-dev

WORKDIR /app
COPY --from=builder ./nyks_tx_decoder/target/release/nyks-tx-decoder ./
COPY .env .env
EXPOSE 8080
ENTRYPOINT ["/app/nyks-tx-decoder"]