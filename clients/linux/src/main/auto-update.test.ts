import { describe, expect, mock, test } from "bun:test";

import {
  UPDATE_CHECK,
  UPDATE_GET_STATE,
  UPDATE_INSTALL,
} from "@vellumai/ipc-contract";
import { resolveUpdateFeedUrl } from "@vellumai/electron-desktop/auto-update";

const registeredChannels: string[] = [];
const feedUrls: string[] = [];

mock.module("electron-updater", () => ({
  autoUpdater: {
    checkForUpdates: () => Promise.resolve(null),
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    channel: "",
    allowDowngrade: false,
    setFeedURL: (options: { url: string }) => {
      feedUrls.push(options.url);
    },
    on: () => undefined,
    quitAndInstall: () => undefined,
  },
}));

mock.module("./logger", () => ({
  default: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
  getLogFilePaths: () => [],
}));

mock.module("./ipc.client", () => ({
  handle: (channel: string) => {
    registeredChannels.push(channel);
  },
  handleSync: () => undefined,
  on: () => undefined,
}));

const { installAutoUpdate, linuxUpdateFeedUrl } = await import("./auto-update");

const withFeed = (feed: string | undefined, fn: () => void): void => {
  const original = process.env.VELLUM_UPDATE_FEED_URL;
  if (feed === undefined) {
    delete process.env.VELLUM_UPDATE_FEED_URL;
  } else {
    process.env.VELLUM_UPDATE_FEED_URL = feed;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env.VELLUM_UPDATE_FEED_URL;
    } else {
      process.env.VELLUM_UPDATE_FEED_URL = original;
    }
  }
};

describe("linuxUpdateFeedUrl", () => {
  test("is disabled when no self-hosted feed is configured", () => {
    withFeed(undefined, () => {
      expect(linuxUpdateFeedUrl("x64")).toBe("");
      expect(linuxUpdateFeedUrl("arm64")).toBe("");
    });
  });

  test("targets the self-hosted feed when one is configured", () => {
    withFeed("https://updates.example.test/linux/", () => {
      expect(linuxUpdateFeedUrl("x64")).toBe("https://updates.example.test/linux/");
    });
  });
});

describe("resolveUpdateFeedUrl", () => {
  test("never falls back to a Vellum-owned release bucket", () => {
    withFeed(undefined, () => {
      const feeds = [
        resolveUpdateFeedUrl("production", "linux-electron", "x64"),
        resolveUpdateFeedUrl("production", "mac-electron", "arm64"),
        resolveUpdateFeedUrl("staging", "linux-electron", "x64"),
      ];
      expect(feeds).toEqual(["", "", ""]);
    });
  });

  test("prefers VELLUM_UPDATE_FEED_URL when set", () => {
    withFeed("https://updates.example.test/feed/", () => {
      expect(resolveUpdateFeedUrl("production", "mac-electron", "arm64")).toBe(
        "https://updates.example.test/feed/",
      );
    });
  });
});

describe("installAutoUpdate", () => {
  test("registers update IPC but leaves the updater idle when unpackaged", () => {
    installAutoUpdate();

    expect(registeredChannels).toEqual([
      UPDATE_GET_STATE,
      UPDATE_CHECK,
      UPDATE_INSTALL,
    ]);
    expect(feedUrls).toEqual([]);
  });
});
