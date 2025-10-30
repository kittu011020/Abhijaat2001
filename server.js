// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

app.get("/", (req, res) => res.send("✅ E2EE Server Running"));

app.post("/register", (req, res) => {
  const { username, publicKey } = req.body;
  if (!username || !publicKey)
    return res.status(400).json({ error: "username/publicKey required" });
  const prev = clients.get(username) || {};
  clients.set(username, { ...prev, publicKey });
  console.log("Registered publicKey for", username);
  return res.json({ ok: true });
});

app.get("/pub/:username", (req, res) => {
  const u = req.params.username;
  const info = clients.get(u);
  if (!info || !info.publicKey)
    return res.status(404).json({ error: "not found" });
  return res.json({ username: u, publicKey: info.publicKey });
});

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "bind") {
        clients.set(data.username, {
          ...(clients.get(data.username) || {}),
          ws,
        });
        ws.username = data.username;
        console.log("Bound ws for", data.username);
        return;
      }

      if (data.type === "send") {
        const to = data.to;
        const dest = clients.get(to);
        if (!dest || !dest.ws || dest.ws.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: "recipient offline" }));
          return;
        }
        dest.ws.send(
          JSON.stringify({
            type: "message",
            from: data.from,
            ciphertext: data.ciphertext,
            nonce: data.nonce,
            ephemeralPub: data.ephemeralPub,
          })
        );
      }
    } catch (e) {
      console.error("Bad message", e);
    }
  });

  ws.on("close", () => {
    if (ws.username) {
      const info = clients.get(ws.username) || {};
      clients.set(ws.username, { publicKey: info.publicKey });
      console.log("Closed WS for", ws.username);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
