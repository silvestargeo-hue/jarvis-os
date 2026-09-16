/**
 * JARVIS OS Desktop — full self-contained app.
 * The complete Next.js server (standalone bundle) runs as a child Node process
 * inside Electron; the window loads it from localhost. Cloud AI, offline
 * WebGPU AI, Convex sync — everything works with zero external hosting.
 */
const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const { autoUpdater } = require("electron-updater");

/**
 * Desktop auto-update: checks the GitHub releases feed for this app
 * (provider: github — see "publish" in package.json). On a tag push, CI
 * uploads installers + latest*.yml; installed builds then prompt to update.
 * Dev/unpackaged runs skip the check (no app metadata to compare against).
 */
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false; // user consents first
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", async (info) => {
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: "info",
        title: "JARVIS OS — Update available",
        message: `JARVIS OS ${info.version} is available.`,
        detail: "Download and install it in the background? The update applies on next launch.",
        buttons: ["Update", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) await autoUpdater.downloadUpdate();
    } catch (e) {
      console.error("[updater] prompt failed:", e);
    }
  });
  autoUpdater.on("update-downloaded", async () => {
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: "info",
        title: "JARVIS OS — Update ready",
        message: "Update downloaded. Restart now to apply it?",
        buttons: ["Restart", "On next launch"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) autoUpdater.quitAndInstall();
    } catch (e) {
      console.error("[updater] install prompt failed:", e);
    }
  });
  autoUpdater.on("error", (e) => console.error("[updater]", e.message));
  // Check shortly after launch, then once an hour; failures are silent (offline OK).
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 15_000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 3_600_000);
}

const PORT = process.env.JARVIS_PORT || 43117;
const APP_URL = `http://127.0.0.1:${PORT}`;
let serverProc = null;
let win = null;

function startServer() {
  const serverPath = process.resourcesPath
    ? path.join(process.resourcesPath, "jarvis-server", "server.js")
    : path.join(__dirname, "..", "jarvis-server", "server.js");
  const serverDir = path.dirname(serverPath);

  serverProc = spawn(process.execPath, [serverPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1", // reuse the Electron binary as plain Node
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => console.log(`[server] ${d}`.trim()));
  serverProc.stderr.on("data", (d) => console.error(`[server] ${d}`.trim()));
  serverProc.on("exit", (code) => console.log(`[server] exited ${code}`));
}

function waitForServer(tries = 60) {
  return new Promise((resolve, reject) => {
    const probe = (n) => {
      if (n <= 0) return reject(new Error("embedded server did not start"));
      const req = http.get(`${APP_URL}/auth`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(() => probe(n - 1), 500));
    };
    probe(tries);
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#020617",
    title: "JARVIS OS",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(APP_URL);
}

app.whenReady().then(async () => {
  setupAutoUpdate();
  startServer();
  try {
    await waitForServer();
  } catch (e) {
    console.error(e);
  }
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProc) {
    try {
      serverProc.kill();
    } catch {}
  }
});
