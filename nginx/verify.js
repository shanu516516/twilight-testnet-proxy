"use strict";

function dbg(r, msg) {
  if ((r.variables.njs_debug || "0") === "1") {
    // shows in nginx error_log / docker logs
    r.log("[njs] " + msg);
  }
}

function addCORS(r) {
  r.headersOut["Access-Control-Allow-Origin"] = "*";
  r.headersOut["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  r.headersOut["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
}

// Build full upstream URL preserving path + query (for logging/errors if needed)
function buildUpstreamURL(r) {
  var base = (r.variables.rpc_upstream_url || "").replace(/\/+$/, "");
  var qs = r.variables.args ? "?" + r.variables.args : "";
  return base + r.uri + qs;
}

// hex -> base64 for GET /broadcast_tx_*?tx=0x...
function hexToBase64(hex) {
  hex = (hex || "").trim();
  if (hex.slice(0, 2).toLowerCase() === "0x") hex = hex.slice(2);
  if (hex.length % 2 === 1) hex = "0" + hex;

  var bytes = [];
  for (var i = 0; i < hex.length; i += 2)
    bytes.push(parseInt(hex.slice(i, i + 2), 16));

  var b64 = "";
  var chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (var j = 0; j < bytes.length; j += 3) {
    var b1 = bytes[j];
    var b2 = j + 1 < bytes.length ? bytes[j + 1] : NaN;
    var b3 = j + 2 < bytes.length ? bytes[j + 2] : NaN;

    var o1 = b1 >> 2;
    var o2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    var o3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    var o4 = isNaN(b3) ? 64 : b3 & 63;

    b64 +=
      chars.charAt(o1) +
      chars.charAt(o2) +
      (o3 === 64 ? "=" : chars.charAt(o3)) +
      (o4 === 64 ? "=" : chars.charAt(o4));
  }
  return b64;
}

function parseJsonRpcBody(txt) {
  try {
    var o = JSON.parse(txt);
    var m = (o && o.method) || "";
    var p = (o && o.params) || {};
    var tx = p.tx || p.tx_bytes || null;
    return { ok: true, method: String(m), tx: tx };
  } catch (e) {
    return { ok: false, method: "", tx: null };
  }
}

async function readBodySafe(r) {
  var body = null;
  try {
    body = await r.requestText();
  } catch (e) {
    body = null;
    dbg(r, "requestText() threw: " + e);
  }
  if (!body || body.length === 0) {
    body = r.variables.request_body || "";
    dbg(r, "fallback $request_body, len=" + body.length);
  } else {
    dbg(r, "requestText() ok, len=" + body.length);
  }
  return body;
}
function subreqBody(res) {
  // Some njs builds expose responseBody, others responseText
  if (res && res.responseBody && res.responseBody.length)
    return res.responseBody;
  if (res && res.responseText && res.responseText.length)
    return res.responseText;
  return "";
}

// Call verifier via subrequest to internal location /__verifier
async function verifyViaSubrequest(r, payload) {
  dbg(
    r,
    "verifyViaSubrequest: start; payload.len=" + (payload ? payload.length : 0)
  );
  var res = await r.subrequest("/__verifier", {
    method: "POST",
    body: payload,
  });
  dbg(
    r,
    "verifyViaSubrequest: status=" +
      res.status +
      " body.len=" +
      (res.responseBody ? res.responseBody.length : 0)
  );
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, verified: false, address: "" };
  }
  try {
    var body = subreqBody(res);
    var o = JSON.parse(body || "");
    var resObj = o && o.result ? o.result : o;
    dbg(r, "verifyViaSubrequest: resObj=" + JSON.stringify(resObj));
    dbg(r, "verifyViaSubrequest: resObj.verified=" + resObj.verified);
    dbg(r, "verifyViaSubrequest: resObj.address=" + resObj.address);
    var v = !!(resObj && resObj.verified === true);
    var addr = resObj && resObj.address ? resObj.address : "";
    dbg(r, "verifyViaSubrequest: parsed verified=" + v + " address=" + addr);
    return { ok: true, verified: v, address: addr };
  } catch (e) {
    dbg(r, "verifyViaSubrequest: JSON parse error: " + e);
    return { ok: false, verified: false, address: "" };
  }
}

async function gateGET(r) {
  dbg(r, "gateGET uri=" + r.uri + " args=" + (r.variables.args || ""));
  var isBroadcast = /\/broadcast_tx_(sync|commit|async)$/.test(r.uri);
  if (!isBroadcast) return true;

  var txArg = r.variables.arg_tx || "";
  if (!txArg) {
    addCORS(r);
    r.headersOut["Content-Type"] = "application/json";
    r.return(
      400,
      JSON.stringify({ error: "bad_request", detail: "missing tx" })
    );
    return false;
  }

  var txIsHex = /^0x[0-9a-fA-F]+$/.test(txArg);
  var txB64 = txIsHex ? hexToBase64(txArg) : txArg;
  dbg(r, "gateGET broadcast: hex=" + txIsHex + " b64.len=" + txB64.length);

  var payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "broadcast_tx_sync",
    params: { tx: txB64 },
  });

  var v = await verifyViaSubrequest(r, payload);
  if (!v.ok || !v.verified) {
    addCORS(r);
    r.headersOut["Content-Type"] = "application/json";
    r.return(
      403,
      JSON.stringify({
        error: "not_whitelisted",
        address: v.address || "",
        verified: false,
      })
    );
    return false;
  }
  return true;
}

async function gatePOST(r) {
  var ct = (r.headersIn["content-type"] || "").toLowerCase();
  dbg(r, "gatePOST ct=" + ct);
  if (ct.indexOf("application/json") === -1) return true;

  var body = await readBodySafe(r);
  if (!body) {
    addCORS(r);
    r.headersOut["Content-Type"] = "application/json";
    r.return(
      400,
      JSON.stringify({ error: "bad_request", detail: "cannot read body" })
    );
    return false;
  }

  var parsed = parseJsonRpcBody(body);
  dbg(r, "gatePOST parsed.ok=" + parsed.ok + " method=" + parsed.method);
  if (!parsed.ok) return true;

  var m = parsed.method;
  if (
    m !== "broadcast_tx_sync" &&
    m !== "broadcast_tx_commit" &&
    m !== "broadcast_tx_async"
  ) {
    return true; // non-broadcast → allow
  }

  var v = await verifyViaSubrequest(r, body); // send original JSON-RPC body
  if (!v.ok || !v.verified) {
    addCORS(r);
    r.headersOut["Content-Type"] = "application/json";
    r.return(
      403,
      JSON.stringify({
        error: "not_whitelisted",
        address: v.address || "",
        verified: false,
      })
    );
    return false;
  }
  return true;
}

// Access-phase entry point: return ngx.OK to continue to proxy_pass
async function access(r) {
  dbg(r, "access: method=" + r.method + " uri=" + r.uri);

  // Allow WS upgrades to flow; no gating here
  var upg = r.headersIn["upgrade"];
  if (upg && upg.toLowerCase() === "websocket") {
    dbg(r, "access: WS upgrade; skipping gate");
    return; // continue
  }

  if (r.method === "OPTIONS") {
    dbg(r, "access: OPTIONS preflight; skipping gate");
    return;
  }

  if (r.method === "GET") {
    var okGet = await gateGET(r);
    if (!okGet) return r.return; // already returned
    return;
  }

  if (r.method === "POST") {
    var okPost = await gatePOST(r);
    if (!okPost) return r.return; // already returned
    return;
  }

  // other methods → allow
  dbg(r, "access: other method; allow");
  return;
}

export default { access: access };
