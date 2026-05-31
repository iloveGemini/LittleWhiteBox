/* eslint-disable -- generated from TypeScript source; run npm run build:tavern */
import { getRequestHeaders } from "../../../../../../script.js";
import { extensionFolderPath } from "../../core/constants.js";
import { createFirstPartyIframeOverlay, loadFirstPartyIframeCacheKey } from "../../core/first-party-iframe-app.js";
import { isTrustedMessage, postToIframe } from "../../core/iframe-messaging.js";
import { buildTavernFrameConfig, saveTavernAgentConfig } from "./host/agent-config.js";
import { buildTavernContext } from "./host/sillytavern-context.js";
const SOURCE_HOST = "xb-tavern-host";
const SOURCE_APP = "xb-tavern-app";
const OVERLAY_ID = "xiaobaix-tavern-overlay";
const IFRAME_ID = "xiaobaix-tavern-iframe";
const HTML_PATH = `${extensionFolderPath}/modules/tavern/tavern.html`;
const BUILD_INFO_PATH = `${extensionFolderPath}/modules/tavern/dist/tavern-build.json`;
let tavernCacheKey = "";
let frameReady = false;
let pendingMessages = [];
let messageHandlerInstalled = false;
async function loadTavernCacheKey() {
  if (tavernCacheKey) {
    return tavernCacheKey;
  }
  tavernCacheKey = await loadFirstPartyIframeCacheKey(BUILD_INFO_PATH);
  return tavernCacheKey;
}
function getIframe() {
  const iframe = document.getElementById(IFRAME_ID);
  return iframe instanceof HTMLIFrameElement ? iframe : null;
}
function postToFrame(type, payload = {}) {
  const iframe = getIframe();
  if (!iframe?.contentWindow) {
    return false;
  }
  const message = { type, payload };
  if (!frameReady) {
    pendingMessages.push(message);
    return false;
  }
  return postToIframe(iframe, message, SOURCE_HOST);
}
function flushPendingMessages() {
  if (!frameReady) {
    return;
  }
  const iframe = getIframe();
  if (!iframe?.contentWindow) {
    return;
  }
  pendingMessages.forEach((message) => postToIframe(iframe, message, SOURCE_HOST));
  pendingMessages = [];
}
async function sendConfigToFrame(options = {}) {
  const contextPayload = await buildTavernContext(options);
  postToFrame("xb-tavern:config", await buildTavernFrameConfig(contextPayload));
}
async function refreshContext(options = {}) {
  postToFrame("xb-tavern:context", await buildTavernContext(options));
}
async function saveConfigFromFrame(payload = {}) {
  const requestId = String(payload.requestId || "");
  const configPatch = payload.payload && typeof payload.payload === "object" ? payload.payload : {};
  const result = await saveTavernAgentConfig(configPatch, { silent: false });
  postToFrame("xb-tavern:config-saved", {
    requestId,
    ok: result.ok,
    config: result.config,
    error: result.error || ""
  });
  if (result.ok) {
    await sendConfigToFrame();
  }
}
function replyHostResult(requestId = "", payload = {}) {
  postToFrame("xb-tavern:host-result", {
    requestId,
    ...payload
  });
}
function handleHostRequestHeaders(payload = {}) {
  replyHostResult(String(payload.requestId || ""), {
    ok: true,
    hostRequestHeaders: getRequestHeaders?.() || {}
  });
}
async function createOverlay() {
  return createFirstPartyIframeOverlay({
    overlayId: OVERLAY_ID,
    iframeId: IFRAME_ID,
    htmlPath: HTML_PATH,
    version: await loadTavernCacheKey()
  });
}
async function openTavern() {
  if (document.getElementById(OVERLAY_ID)) {
    return;
  }
  frameReady = false;
  pendingMessages = [];
  installMessageHandler();
  await createOverlay();
}
function closeTavern() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.remove();
  }
  frameReady = false;
  pendingMessages = [];
}
function handleFrameMessage(event) {
  const iframe = getIframe();
  if (!isTrustedMessage(event, iframe, SOURCE_APP)) {
    return;
  }
  const data = event.data || {};
  switch (data.type) {
    case "xb-tavern:frame-ready":
      frameReady = true;
      void sendConfigToFrame().then(flushPendingMessages);
      break;
    case "xb-tavern:close":
      closeTavern();
      break;
    case "xb-tavern:refresh-context":
      void refreshContext(data.payload || {});
      break;
    case "xb-tavern:save-config":
      void saveConfigFromFrame(data.payload || {});
      break;
    case "xb-tavern:get-host-request-headers":
      handleHostRequestHeaders(data.payload || {});
      break;
    default:
      break;
  }
}
function installMessageHandler() {
  if (messageHandlerInstalled) {
    return;
  }
  window.addEventListener("message", handleFrameMessage);
  messageHandlerInstalled = true;
}
async function initTavern() {
  installMessageHandler();
  window.xiaobaixTavern = {
    open: openTavern,
    close: closeTavern,
    refreshContext
  };
}
function cleanupTavern() {
  closeTavern();
}
export {
  cleanupTavern,
  closeTavern,
  initTavern,
  openTavern
};
