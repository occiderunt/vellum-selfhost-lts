import { app, BrowserWindow } from "electron";
import { z } from "zod";

import type { UpdateState, UpdateStatus } from "@vellumai/ipc-contract";

import type {
  AutoUpdateConfig,
  DesktopAutoUpdater,
  UpdateFeedPlatform,
  UpdaterLogger,
} from "./auto-update-contract";
import type { IpcHandle } from "./ipc";

export type { UpdateState, UpdateStatus };
export type {
  AutoUpdateConfig,
  DesktopAutoUpdater,
  UpdateFeedPlatform,
  UpdaterLogger,
} from "./auto-update-contract";

/**
 * Generic update feed for this build.
 *
 * Upstream resolved this to Vellum's own release bucket
 * (`vellum-ai-prod-releases`), which is decommissioned alongside the hosted
 * platform. A self-hosted build must never poll a feed it does not control, so
 * the feed is now opt-in via `VELLUM_UPDATE_FEED_URL`, which should point at a
 * directory containing `latest-mac.yml` / `latest-linux.yml` and the artifacts.
 *
 * Returning an empty string means auto-update is disabled: no feed is
 * configured, and `installAutoUpdate` makes no network request. The unused
 * environment/platform/arch arguments are retained so call sites stay stable
 * and a future multi-channel setup can restore per-platform feeds.
 */
export const resolveUpdateFeedUrl = (
  _environment: string,
  _platform: UpdateFeedPlatform,
  _arch: string,
): string => process.env.VELLUM_UPDATE_FEED_URL?.trim() ?? "";

let autoUpdater: DesktopAutoUpdater;
let handle: IpcHandle;
let log: UpdaterLogger;
let ENVIRONMENT: string;
let feedUrl: string;

/** Each desktop shell configures its updater, IPC, logger, and feed once. */
export const configureAutoUpdate = (config: AutoUpdateConfig): void => {
  ({
    updater: autoUpdater,
    logger: log,
    environment: ENVIRONMENT,
    feedUrl,
  } = config);
  ({ handle } = config.ipc);
};

let currentState: UpdateState = { status: "idle" };

const setState = (next: UpdateState): void => {
  currentState = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("vellum:update:state", currentState);
    }
  }
};

export const checkForUpdates = (): void => {
  if (!feedUrl) return;
  autoUpdater
    .checkForUpdates()
    .then((result) => {
      // With `autoDownload`, electron-updater returns the in-flight download
      // on the resolved result and rethrows download failures on it after
      // emitting `error`. The `error` listener owns state and logging, so this
      // only keeps the rejection from escaping.
      result?.downloadPromise?.catch(() => undefined);
    })
    .catch((err: unknown) => {
      log.error("[auto-update] checkForUpdates failed:", err);
    });
};

export const installAutoUpdate = (): void => {
  handle("vellum:update:getState", z.tuple([]), () => currentState);
  handle("vellum:update:check", z.tuple([]), () => checkForUpdates());
  handle("vellum:update:install", z.tuple([]), () =>
    autoUpdater.quitAndInstall(),
  );

  if (!app.isPackaged) return;

  if (!feedUrl) {
    log.info("[auto-update] no feed configured; auto-update disabled");
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.channel = ENVIRONMENT;
  autoUpdater.allowDowngrade = false;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: feedUrl,
  });

  autoUpdater.on("checking-for-update", () => {
    setState({ status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    setState({ status: "available", version: info.version });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    setState({
      status: "downloading",
      progress: {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
      },
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setState({ status: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err) => {
    log.error("[auto-update] error:", err);
    setState({ status: "error", error: err.message });
  });

  autoUpdater.on("update-not-available", () => {
    setState({ status: "idle" });
  });

  checkForUpdates();
  setInterval(checkForUpdates, 4 * 60 * 60 * 1000);
};
