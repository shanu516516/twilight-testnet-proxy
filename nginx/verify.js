"use strict";

function dbg(r, msg) {
  if ((r.variables.njs_debug || "0") === "1") r.log("[njs] " + msg);
}

function addCORS(r) {
  var origin = r.headersIn["origin"];
  if (origin) {
    r.headersOut["Access-Control-Allow-Origin"] = origin;
    r.headersOut["Vary"] = "Origin";
    r.headersOut["Access-Control-Allow-Credentials"] = "true";
  } else {
    r.headersOut["Access-Control-Allow-Origin"] = "*";
  }
  r.headersOut["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";

  var reqHdrs = r.headersIn["access-control-request-headers"];
  r.headersOut["Access-Control-Allow-Headers"] = reqHdrs
    ? reqHdrs
    : "Content-Type, Authorization";
}

function hexToBase64(hex) {
  hex = (hex || "").trim();
  if (hex.slice(0, 2).toLowerCase() === "0x") hex = hex.slice(2);
  if (hex.length % 2 === 1) hex = "0" + hex;
  var bytes = [],
    b64 = "",
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (var i = 0; i < hex.length; i += 2)
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  for (var j = 0; j < bytes.length; j += 3) {
    var b1 = bytes[j],
      b2 = j + 1 < bytes.length ? bytes[j + 1] : NaN,
      b3 = j + 2 < bytes.length ? bytes[j + 2] : NaN;
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
  try {
    if (typeof r.requestText === "function") {
      var t = await r.requestText();
      if (t && t.length) {
        dbg(r, "readBodySafe: via requestText() len=" + t.length);
        return t;
      }
    } else if (typeof r.requestText === "string" && r.requestText.length) {
      dbg(
        r,
        "readBodySafe: via requestText (string) len=" + r.requestText.length
      );
      return r.requestText;
    }
  } catch (e) {
    dbg(r, "readBodySafe: requestText threw: " + e);
  }
  if (typeof r.requestBody === "string" && r.requestBody.length) {
    dbg(r, "readBodySafe: via requestBody len=" + r.requestBody.length);
    return r.requestBody;
  }
  var v = r.variables.request_body || "";
  dbg(r, "readBodySafe: via $request_body len=" + v.length);
  return v;
}

function subreqBody(res) {
  if (res && res.responseBody && res.responseBody.length)
    return res.responseBody;
  if (res && res.responseText && res.responseText.length)
    return res.responseText;
  return "";
}

/* ---------- verifier (whitelist) via internal subrequest ---------- */
async function verifyViaSubrequest(r, payload) {
  dbg(
    r,
    "verifyViaSubrequest: start; payload.len=" + (payload ? payload.length : 0)
  );
  var res = await r.subrequest("/__verifier", {
    method: "POST",
    body: payload,
  });
  var body = subreqBody(res);
  dbg(
    r,
    "verifyViaSubrequest: status=" + res.status + " body.len=" + body.length
  );
  if (res.status < 200 || res.status >= 300 || !body)
    return { ok: false, verified: false, address: "" };
  try {
    var o = JSON.parse(body);
    var resObj = o && o.result ? o.result : o;
    var v = false;
    var addr = resObj && resObj.address ? resObj.address : "";
    // If is_kyc_mandatory === false, treat as verified true
    if (resObj && resObj.is_kyc_mandatory === false) {
      v = true;
      dbg(
        r,
        "verifyViaSubrequest: is_kyc_mandatory is false, treating as verified=true; address=" +
          addr
      );
    } else {
      v = !!(resObj && resObj.verified === true);
      dbg(r, "verifyViaSubrequest: parsed verified=" + v + " address=" + addr);
    }
    return { ok: true, verified: v, address: addr };
  } catch (e) {
    dbg(
      r,
      "verifyViaSubrequest: JSON parse error: " +
        e +
        " body[0..200]=" +
        body.slice(0, 200)
    );
    return { ok: false, verified: false, address: "" };
  }
}

/* ---------- proxy to RPC upstream via internal subrequest ---------- */
// async function proxyToUpstream(r, bodyOpt) {
//   try {
//     var tail = r.uri + (r.variables.args ? "?" + r.variables.args : "");
//     var res = await r.subrequest("/__upstream" + tail, {
//       method: r.method,
//       body: bodyOpt,
//     });

//     var out = subreqBody(res) || "";
//     var ct =
//       (res.headersOut &&
//         (res.headersOut["Content-Type"] || res.headersOut["content-type"])) ||
//       "application/json";
//     var enc =
//       (res.headersOut &&
//         (res.headersOut["Content-Encoding"] ||
//           res.headersOut["content-encoding"])) ||
//       "";

//     r.status = res.status || 502;
//     r.headersOut["Content-Type"] = ct;
//     if (enc) r.headersOut["Content-Encoding"] = enc;

//     addCORS(r);
//     r.sendHeader(); // ensure proper HTTP/1.1 response
//     if (out.length) r.send(out); // relay exact JSON (unchanged)
//     r.finish();
//   } catch (e) {
//     addCORS(r);
//     r.headersOut["Content-Type"] = "application/json";
//     r.return(
//       502,
//       JSON.stringify({ error: "upstream_error", detail: String(e) })
//     );
//   }
// }
function proxyToUpstream(r, bodyOpt) {
  if (bodyOpt !== undefined) {
    // save body to an nginx variable so the named location can reuse it
    r.variables.req_body = bodyOpt;
    r.internalRedirect("@up_post");
  } else {
    r.internalRedirect("@up_get");
  }
}

/* ---------- GET gate only for /broadcast_tx_* ---------- */
async function gateGET(r) {
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

/* ---------- POST gate only for broadcast_* methods ---------- */
async function gatePOST(r, body) {
  var ct = (r.headersIn["content-type"] || "").toLowerCase();
  if (ct.indexOf("application/json") === -1) return true;

  var parsed = parseJsonRpcBody(body);
  if (!parsed.ok) return true;

  var m = parsed.method;
  if (
    m !== "broadcast_tx_sync" &&
    m !== "broadcast_tx_commit" &&
    m !== "broadcast_tx_async"
  ) {
    // e.g. status, abci_query, tx_search → NOT gated
    return true;
  }

  var v = await verifyViaSubrequest(r, body);
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

/* ---------- single public handler ---------- */
async function entry(r) {
  dbg(r, "entry: method=" + r.method + " uri=" + r.uri);

  var upg = r.headersIn["upgrade"];
  if (upg && upg.toLowerCase() === "websocket") {
    return r.internalRedirect("@up_ws");
  }

  if (r.method === "OPTIONS") {
    addCORS(r);
    r.headersOut["Access-Control-Max-Age"] = "86400";
    r.return(204, "");
    return;
  }

  if (r.method === "GET") {
    var okGet = await gateGET(r);
    if (!okGet) return;
    proxyToUpstream(r); // no body
    return;
  }

  if (r.method === "POST") {
    var body = await readBodySafe(r); // read once for gating
    var okPost = await gatePOST(r, body);
    if (!okPost) return;
    proxyToUpstream(r, body); // stream via named location with restored body
    return;
  }

  proxyToUpstream(r);
  return;
}

export default { entry: entry };
