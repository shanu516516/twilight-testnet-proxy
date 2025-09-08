"use strict";

function dbg(r, msg) {
  if ((r.variables.njs_debug || "0") === "1") r.log("[njs] " + msg);
}

// function addCORS(r) {
//   // If your frontend uses credentials, switch '*' to the request Origin and also add:
//   //   r.headersOut["Access-Control-Allow-Credentials"] = "true";
//   // and consider adding Vary: Origin
//   r.headersOut["Access-Control-Allow-Origin"] = "*";
//   r.headersOut["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
//   r.headersOut["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
// }
function addCORS(r) {
  // Mirror the caller's Origin when present (needed for credentials),
  // otherwise fall back to "*"
  var origin = r.headersIn["origin"];
  if (origin) {
    r.headersOut["Access-Control-Allow-Origin"] = origin;
    r.headersOut["Vary"] = "Origin"; // avoid cache mix-ups
  } else {
    r.headersOut["Access-Control-Allow-Origin"] = "*";
  }

  r.headersOut["Access-Control-Allow-Credentials"] = "true";
  r.headersOut["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";

  // If the browser asked for specific headers, echo them back
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

// async function readBodySafe(r) {
//   var body = null;
//   try {
//     dbg(r, "requestText()" + JSON.stringify(r));
//     body = await r.requestText();
//   } catch (e) {
//     body = null;
//     dbg(r, "requestText() threw: " + e);
//   }
//   try {
//     body = await r.requestBody();
//   } catch (e) {
//     body = null;
//     dbg(r, "requestBody() threw: " + e);
//   }
//   if (!body || body.length === 0) {
//     body = r.variables.request_body || "";
//     dbg(r, "fallback $request_body, len=" + body.length);
//   } else {
//     dbg(r, "requestText() ok, len=" + body.length);
//   }
//   return body;
// }
async function readBodySafe(r) {
  // njs can expose the body in different ways depending on version/build
  try {
    if (typeof r.requestText === "function") {
      // modern njs: async reader
      var t = await r.requestText();
      if (t && t.length) {
        dbg(r, "readBodySafe: via requestText() len=" + t.length);
        return t;
      }
    } else if (typeof r.requestText === "string" && r.requestText.length) {
      // some builds expose a string property named requestText (!)
      dbg(
        r,
        "readBodySafe: via requestText (string) len=" + r.requestText.length
      );
      return r.requestText;
    }
  } catch (e) {
    dbg(r, "readBodySafe: requestText threw: " + e);
  }

  // other possible places
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

// ---- whitelist verifier call (internal subrequest) ----
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
    var v = !!(resObj && resObj.verified === true);
    var addr = resObj && resObj.address ? resObj.address : "";
    dbg(r, "verifyViaSubrequest: parsed verified=" + v + " address=" + addr);
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

// ---- proxy to RPC (internal subrequest), then relay response + CORS ----
async function proxyToUpstream(r, bodyOpt) {
  var tail = r.uri + (r.variables.args ? "?" + r.variables.args : "");
  var res = await r.subrequest("/__upstream" + tail, {
    method: r.method,
    body: bodyOpt,
  });

  var out = subreqBody(res);
  var ct =
    (res.headersOut &&
      (res.headersOut["Content-Type"] || res.headersOut["content-type"])) ||
    "application/json";

  r.status = res.status;
  r.headersOut["Content-Type"] = ct;
  addCORS(r);
  // r.headersOut["Access-Control-Allow-Origin"] = "*";
  // r.send(out || "");
  r.sendHeader();
  if (out.length) r.send(out);
  // r.finish();
  r.finish();
}

// ---- GET gate (for /broadcast_tx_*?tx=...) ----
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

// ---- POST gate (JSON-RPC broadcast methods) ----
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
  )
    return true;

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

// ---- single public handler: gate -> proxy (subrequest) ----
async function entry(r) {
  dbg(r, "entry: method=" + r.method + " uri=" + r.uri);

  // WebSocket → pass to named upstream (subrequest can’t handle WS)
  var upg = r.headersIn["upgrade"];
  if (upg && upg.toLowerCase() === "websocket") {
    dbg(r, "entry: WS upgrade; redirecting to @up");
    return r.internalRedirect("@up");
  }

  // CORS preflight
  // In your entry() (preflight branch), make sure you call addCORS and return 204:
  if (r.method === "OPTIONS") {
    addCORS(r);
    r.headersOut["Access-Control-Max-Age"] = "86400"; // optional: cache preflight for 1 day
    r.return(204, "");
    return;
  }

  if (r.method === "GET") {
    var okGet = await gateGET(r);
    if (!okGet) return;
    return proxyToUpstream(r);
  }

  if (r.method === "POST") {
    var body = await readBodySafe(r); // we consumed it; forward it ourselves
    var ct = (r.headersIn["content-type"] || "").toLowerCase();
    if (ct.indexOf("application/json") !== -1) {
      var parsed = parseJsonRpcBody(body || "");
      if (parsed.ok) {
        var m = parsed.method;
        if (
          m === "broadcast_tx_sync" ||
          m === "broadcast_tx_commit" ||
          m === "broadcast_tx_async"
        ) {
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
            return;
          }
        }
      }
    }
    return proxyToUpstream(r, body);
  }

  // Other methods → just proxy
  return proxyToUpstream(r);
}

export default { entry: entry };
