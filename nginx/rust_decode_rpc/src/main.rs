use base64::{engine::general_purpose, Engine as _};
use bech32::{encode, ToBase32, Variant};
use cosmrs::crypto::PublicKey;
use cosmrs::{proto, tx::Raw};
use jsonrpsee::core::RpcResult;
use jsonrpsee::proc_macros::rpc;
use jsonrpsee::server::{ServerBuilder, ServerHandle};
use jsonrpsee::types::ErrorObjectOwned;
use prost::Message;
use reqwest::header::CONTENT_TYPE;
use reqwest::Client;
use serde::Deserialize;

#[rpc(server)]
pub trait TwilightRpc {
    // We accept a single string param (the base64 tx)
    #[method(name = "broadcast_tx_sync")]
    async fn broadcast_tx_sync(&self, tx: String) -> RpcResult<String>;
}

pub struct TwilightRpcImpl {
    client: Client,
}

#[async_trait::async_trait]
impl TwilightRpcServer for TwilightRpcImpl {
    async fn broadcast_tx_sync(&self, tx: String) -> RpcResult<String> {
        // 1) base64 decode
        let tx_bytes = general_purpose::STANDARD.decode(&tx).map_err(|e| {
            ErrorObjectOwned::owned(-32000, format!("base64 decode failed: {e}"), None::<()>)
        })?;

        // 2) parse raw tx
        let raw_tx = Raw::from_bytes(tx_bytes.as_slice()).map_err(|e| {
            ErrorObjectOwned::owned(-32000, format!("tx decode failed: {e}"), None::<()>)
        })?;

        // 3) extract pubkey
        let tx_raw_proto: proto::cosmos::tx::v1beta1::TxRaw = raw_tx.clone().into();
        let auth_info_bytes = tx_raw_proto.auth_info_bytes;
        let pubkey_any = if !auth_info_bytes.is_empty() {
            let auth_info: proto::cosmos::tx::v1beta1::AuthInfo =
                Message::decode(&*auth_info_bytes).map_err(|e| {
                    ErrorObjectOwned::owned(
                        -32000,
                        format!("auth_info decode failed: {e}"),
                        None::<()>,
                    )
                })?;
            auth_info
                .signer_infos
                .first()
                .and_then(|s| s.public_key.as_ref())
                .cloned()
        } else {
            None
        };

        let pubkey_any = pubkey_any.ok_or_else(|| {
            ErrorObjectOwned::owned(-32000, "no signer public key found", None::<()>)
        })?;

        let pk = PublicKey::try_from(pubkey_any).map_err(|e| {
            ErrorObjectOwned::owned(
                -32000,
                format!("unsupported/invalid pubkey: {e}"),
                None::<()>,
            )
        })?;
        let pk_bytes = pk.to_bytes();

        // 3a) bech32-encode pubkey with HRP "twilight" (per your requirement)
        let pubkey_bech32 =
            encode("twilight", pk_bytes.to_base32(), Variant::Bech32).map_err(|e| {
                ErrorObjectOwned::owned(-32000, format!("bech32 encode failed: {e}"), None::<()>)
            })?;

        // 3b) also compute account address (useful if faucet expects address)
        let address = pk
            .account_id("twilight")
            .map_err(|e| {
                ErrorObjectOwned::owned(
                    -32000,
                    format!("account id derive failed: {e}"),
                    None::<()>,
                )
            })?
            .to_string();

        // 4) call faucet whitelist; include both fields to be safe
        let resp = self
            .client
            .post("https://faucet-rpc.twilight.rest//whitelist/status")
            .json(&serde_json::json!({
                "recipientAddress": address,
            }))
            .send()
            .await
            .map_err(|e| {
                ErrorObjectOwned::owned(
                    -32000,
                    format!("whitelist request failed: {e}"),
                    None::<()>,
                )
            })?;

        let status_code = resp.status();
        // let content_type = resp
        //     .headers()
        //     .get(CONTENT_TYPE)
        //     .and_then(|h| h.to_str().ok())
        //     .unwrap_or("");

        // Read body as text first; try JSON if possible
        let body_text = resp.text().await.map_err(|e| {
            ErrorObjectOwned::owned(
                -32000,
                format!("whitelist body read failed: {e}"),
                None::<()>,
            )
        })?;

        // Try parse JSON; else keep raw text
        let parsed_json: Option<serde_json::Value> = serde_json::from_str(&body_text).ok();

        // Decide "verified"
        let verified = if let Some(v) = &parsed_json {
            // Prefer nested data.whitelisted if present
            v.pointer("/data/whitelisted")
                .and_then(|b| b.as_bool())
                // Fallbacks for other server shapes
                .or_else(|| v.get("whitelisted").and_then(|b| b.as_bool()))
                .or_else(|| v.get("verified").and_then(|b| b.as_bool()))
                .or_else(|| v.get("success").and_then(|b| b.as_bool()))
                .unwrap_or(status_code.is_success())
        } else {
            // Heuristic for text responses
            let t = body_text.to_lowercase();
            status_code.is_success()
                && (t.contains("ok") || t.contains("true") || t.contains("whitelist"))
        };

        let faucet_response = parsed_json.clone().unwrap_or_else(
            || serde_json::json!({ "raw": body_text, "status": status_code.as_u16() }),
        );

        // Extract server-reported address and message if present
        let server_address = parsed_json
            .as_ref()
            .and_then(|v| v.pointer("/data/address").and_then(|s| s.as_str()))
            .unwrap_or("")
            .to_string();
        let server_message = parsed_json
            .as_ref()
            .and_then(|v| v.get("message").and_then(|s| s.as_str()))
            .unwrap_or("")
            .to_string();

        let out = serde_json::json!({
            "address": address,
            "verified": verified,
        });

        Ok(out.to_string())
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let server = ServerBuilder::default().build("127.0.0.1:8080").await?;
    let handle: ServerHandle = server.start(
        TwilightRpcImpl {
            client: Client::new(),
        }
        .into_rpc(),
    );
    handle.stopped().await;
    Ok(())
}
