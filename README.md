# Twilight Testnet Proxy

This repository contains the necessary configuration to run the Twilight Testnet services using Docker Compose. It includes a reverse proxy (Nginx) with SSL certificate issuance (Certbot) and several backend services.

## Prerequisites

- Docker
- Docker Compose
- A domain name with DNS records pointing to the server where you are running this project. You will need subdomains for each of the services you want to expose (e.g., `frontend.your.domain.com`, `explorer.your.domain.com`, `faucet.your.domain.com`).

## Services

- `frontend`: The web interface for the testnet.
- `nyks_tx_decoder`: A service for decoding Nyks transactions.
- `nginx`: A reverse proxy for all the services.
- `nyks_explorer`: A block explorer for the Nyks chain.
- `pingpong_faucet`: A faucet for requesting testnet tokens.
- `certbot`: A service for obtaining and renewing SSL certificates from Let's Encrypt.

## Setup and Configuration

This guide assumes you are deploying to your own domain. If you are using `testnet.twilight.rest`, you can skip the configuration steps.

### 1. Configure Explorer

Before building the Docker containers, you need to update the explorer configuration files with your domain.

- **`nyks_explorer/nyks.json`**: Update the `address` fields for `api` and `rpc` to point to your domain.
- **`nyks_explorer/nyks_testnet.json`**: Update the `address` fields for `api` and `rpc` to point to your domain.

Example (`nyks_explorer/nyks_testnet.json`):

```json
{
  "api": [
    {
      "provider": "nyks",
      "address": "https://lcd.your.domain.com/"
    }
  ],
  "rpc": [
    {
      "provider": "nyks",
      "address": "https://rpc.your.domain.com/"
    }
  ]
}
```

### 2. Configure Faucet

Update the `nyks_faucet/config.js` file with your domain and other settings.

```javascript
  blockchain: {
    // cors_allowed_origins = ["*"]
    endpoint: "https://lcd.your.domain.com",
    rpc_endpoint: "https://rpc.your.domain.com",
  },
```

### 3. Configure Transaction Decoder

The `nyks_tx_decoder` service requires a `.env` file in the `nyks_tx_decoder` directory. Create this file and add the necessary environment variables.

_(Note: The required variables for the decoder are not defined in this repository. You will need to consult the `nyks_tx_decoder` documentation to find the correct values.)_

### 4. Configure Frontend

Create a `.env.frontend` file in the root of the project for the frontend service. This file will be copied into the container during the build process.

```
# Example .env.frontend
NEXT_PUBLIC_TWILIGHT_API_RPC=https://rpc.your.domain.com/
NEXT_PUBLIC_TWILIGHT_API_REST=https://lcd.your.domain.com/
NEXT_PUBLIC_ZKOS_API_ENDPOINT=https://zkos.your.domain.com/
PRICE_ORACLE_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyaWQiOiJ0ZXN0X3VzZXIiLCJpc19hZG1pbiI6ZmFsc2UsImV4cCI6NDgzNzE0Mzk1OSwiaWF0IjoxNjgzNTQzOTU5fQ.jn1u6__HRuqSHk8kXXlCY4FXli1F5V7UzNHP_8OfC78
NEXT_PUBLIC_RELAYER_ENDPOINT=https://relayer.your.domain.com/relayer/
NEXT_PUBLIC_CLIENT_ENDPOINT=https://relayer.your.domain.com/clientapi/
NEXT_PUBLIC_TWILIGHT_PRICE_REST=https://relayer.your.domain.com/api
NEXT_PUBLIC_TWILIGHT_PRICE_WS=wss://relayer.your.domain.com/ws
NEXT_PUBLIC_TWILIGHT_PRICE_REST_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyaWQiOiJ0ZXN0X3VzZXIiLCJpc19hZG1pbiI6ZmFsc2UsImV4cCI6NDgzNzE0Mzk1OSwiaWF0IjoxNjgzNTQzOTU5fQ.jn1u6__HRuqSHk8kXXlCY4FXli1F5V7UzNHP_8OfC78
VERCEL_URL=https://frontend.your.domain.com
NEXT_PUBLIC_FAUCET_ENDPOINT=https://faucet.your.domain.com
NEXT_PUBLIC_EXPLORER_URL=https://explorer.your.domain.com/nyks
```

### 5. Configure Nginx and SSL

Create a `.env` file in the root of the project to configure Nginx.

```
# Nginx Configuration
# The domain for which the SSL certificate will be issued
DOMAIN=your.domain.com
```

### 6. Initial Nginx Setup

First, bring up the `nginx` service without SSL to allow Certbot to perform the HTTP-01 challenge.

```bash
docker-compose up -d --build nginx
```

### 7. Issue SSL Certificates

Next, run the `issue-certs.sh` script to obtain SSL certificates for your domain.

```bash
DOMAIN=your.domain.com LETSENCRYPT_EMAIL=your-email@example.com STAGING=1 ./scripts/issue-certs.sh
```

### 8. Rebuild Nginx with SSL

After the certificates have been issued, you need to rebuild the `nginx` container to include the SSL configuration.

```bash
docker-compose up -d --build nginx
```

## Running the Application

Once you have completed all the setup and configuration steps, you can bring up all the services.

```bash
docker-compose up -d --build
```

You should now be able to access the frontend and other services at the domain you configured.
