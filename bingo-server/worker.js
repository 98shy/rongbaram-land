import { hasDuplicateLabel, updateCell, validBoard } from "../bingo-model.js";

const ROOM_TOKEN = /^[a-f0-9]{48}$/;

async function readJSON(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 64 * 1024) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    if (request.headers.get("Origin") !== env.SITE_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }
    const headers = {
      "Access-Control-Allow-Origin": env.SITE_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    };
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (pathname === "/rooms" && request.method === "POST") {
      const board = await readJSON(request);
      if (!validBoard(board)) return Response.json({ error: "Invalid board" }, { status: 400, headers });
      const token = [...crypto.getRandomValues(new Uint8Array(24))]
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const room = env.ROOMS.get(env.ROOMS.idFromName(token));
      const response = await room.fetch("https://room.internal/", {
        method: "POST",
        body: JSON.stringify({
          rows: board.rows, columns: board.columns, revision: 0,
          cells: board.cells.map(({ label, mission, missionName = "", missionBalloons = "", done, missionDone = false }) =>
            ({ label, mission, missionName, missionBalloons, done, missionDone })),
        }),
      });
      if (!response.ok) return Response.json({ error: "Room could not be created" }, { status: 503, headers });
      return Response.json({ token }, { status: 201, headers });
    }
    if (pathname === "/room" && ["GET", "PATCH"].includes(request.method)) {
      const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
      if (!token || !ROOM_TOKEN.test(token)) {
        return Response.json({ error: "Invalid room link" }, { status: 401, headers });
      }
      const room = env.ROOMS.get(env.ROOMS.idFromName(token));
      let body;
      if (request.method === "PATCH") {
        const patch = await readJSON(request);
        if (!patch || typeof patch !== "object") {
          return Response.json({ error: "Invalid edit" }, { status: 400, headers });
        }
        body = JSON.stringify({ index: patch.index, field: patch.field, value: patch.value });
      }
      const response = await room.fetch("https://room.internal/", { method: request.method, body });
      const responseHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) responseHeaders.set(key, value);
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    }
    return Response.json({ error: "Not found" }, { status: 404, headers });
  },
};

export class BingoRoom {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, board TEXT NOT NULL)");
  }

  async fetch(request) {
    const payload = request.method === "GET" ? null : await request.json();
    const stored = this.sql.exec("SELECT board FROM state WHERE id = 1").toArray()[0];
    if (request.method === "POST") {
      if (stored) return Response.json({ error: "Room already exists" }, { status: 409 });
      this.sql.exec("INSERT INTO state (id, board) VALUES (1, ?)", JSON.stringify(payload));
      return Response.json(payload, { status: 201 });
    }
    if (!stored) return Response.json({ error: "Room not found" }, { status: 404 });
    const board = JSON.parse(stored.board);
    if (request.method === "PATCH") {
      if (payload.field === "label" && hasDuplicateLabel(board, payload.index, payload.value)) {
        return Response.json({ error: "Duplicate label" }, { status: 409 });
      }
      if (!updateCell(board, payload)) return Response.json({ error: "Invalid edit" }, { status: 400 });
      this.sql.exec("UPDATE state SET board = ? WHERE id = 1", JSON.stringify(board));
    }
    return Response.json(board);
  }
}
