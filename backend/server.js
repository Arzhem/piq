import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import { initDatabase } from "./db.js";
import { initBrowser, closeBrowser } from "./browser.js";
import { startMonitor } from "./monitor.js";

import authRoutes from "./auth.js";
import sitesRoutes from "./sites.js";
import alertsRoutes from "./alerts.js";
import proxyRoutes from "./proxy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(cors());
app.use(express.json());

app.use("/assets", express.static("public"));

app.use("/api", authRoutes);
app.use("/api", sitesRoutes);
app.use("/api", alertsRoutes);
app.use("/api", proxyRoutes);

app.use(express.static(path.join(__dirname, "../frontend/dist")));

app.use((req, res) => {
  if (req.method === "GET") {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

async function init() {
  try {
    await initDatabase();
    await initBrowser();

    console.log("Backend initialized.");
  } catch (err) {
    console.error("Engine initialization failed:", err);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.log("\nShutting down engine...");

  await closeBrowser();

  process.exit();
});

await init();

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

startMonitor();
