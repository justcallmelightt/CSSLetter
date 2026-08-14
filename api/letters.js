const idPattern = /^[A-Za-z0-9_-]{16}$/;
const payloadPattern = /^[A-Za-z0-9_-]{40,24000}$/;
const retentionSeconds = 60 * 60 * 24 * 90;

function send(response, status, body) {
  response.status(status);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

async function redis(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("STORAGE_NOT_CONFIGURED");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error("STORAGE_REQUEST_FAILED");
  const data = await response.json();
  if (data.error) throw new Error("STORAGE_REQUEST_FAILED");
  return data.result;
}

function clientAddress(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim().slice(0, 80);
}

async function allowWrite(request) {
  const bucket = Math.floor(Date.now() / 60000);
  const key = `cssletter:rate:${clientAddress(request)}:${bucket}`;
  const count = Number(await redis(["INCR", key]));
  if (count === 1) await redis(["EXPIRE", key, 70]);
  return count <= 12;
}

export default async function handler(request, response) {
  try {
    if (request.method === "POST") {
      if (!(await allowWrite(request))) return send(response, 429, { error: "TOO_MANY_REQUESTS" });
      const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
      const id = body?.id;
      const payload = body?.payload;
      if (!idPattern.test(id || "") || !payloadPattern.test(payload || "")) return send(response, 400, { error: "INVALID_LETTER" });
      const result = await redis(["SET", `cssletter:letter:${id}`, payload, "EX", retentionSeconds, "NX"]);
      if (result !== "OK") return send(response, 409, { error: "ID_COLLISION" });
      return send(response, 201, { id, expiresIn: retentionSeconds });
    }

    if (request.method === "GET") {
      const id = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id;
      if (!idPattern.test(id || "")) return send(response, 400, { error: "INVALID_ID" });
      const payload = await redis(["GET", `cssletter:letter:${id}`]);
      if (!payload) return send(response, 404, { error: "LETTER_NOT_FOUND" });
      return send(response, 200, { payload });
    }

    response.setHeader("Allow", "GET, POST");
    return send(response, 405, { error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const unavailable = error?.message === "STORAGE_NOT_CONFIGURED";
    return send(response, unavailable ? 503 : 500, { error: unavailable ? "STORAGE_NOT_CONFIGURED" : "INTERNAL_ERROR" });
  }
}
