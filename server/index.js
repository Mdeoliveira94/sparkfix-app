import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn(
    "[sparkfix-server] WARNING: ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env and add your key."
  );
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" })); // generous limit: manual-lookup photos are base64-encoded

// The one endpoint the client talks to. It forwards to Claude's Messages API
// server-side, so the API key never reaches the browser.
app.post("/api/claude", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });
  }

  const { messages, tools, system } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "Request body must include a `messages` array." });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system,
        messages,
        ...(tools ? { tools } : {}),
      }),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("[sparkfix-server] Error calling Anthropic API:", err);
    res.status(502).json({ error: "Failed to reach Claude's API." });
  }
});

// Serve the built client (client/dist) once you've run `npm run build` in client/.
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`[sparkfix-server] listening on http://localhost:${PORT}`);
});
