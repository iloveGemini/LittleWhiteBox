import { getRequestHeaders } from '../../../../../../script.js';
import { extensionFolderPath } from '../../core/constants.js';
import { createFirstPartyIframeOverlay, loadFirstPartyIframeCacheKey } from '../../core/first-party-iframe-app.js';
import { isTrustedMessage, postToIframe } from '../../core/iframe-messaging.js';
import { buildTavernFrameConfig, saveTavernAgentConfig } from './host/agent-config.js';
import { buildTavernContext } from './host/sillytavern-context.js';

interface PendingFrameMessage {
    type: string;
    payload: Record<string, unknown>;
}

interface TavernFacade {
    open: () => Promise<void>;
    close: () => void;
    refreshContext: (options?: Record<string, unknown>) => Promise<void>;
}

declare global {
    interface Window {
        xiaobaixTavern?: TavernFacade;
    }
}

const SOURCE_HOST = 'xb-tavern-host';
const SOURCE_APP = 'xb-tavern-app';
const OVERLAY_ID = 'xiaobaix-tavern-overlay';
const IFRAME_ID = 'xiaobaix-tavern-iframe';
const HTML_PATH = `${extensionFolderPath}/modules/tavern/tavern.html`;
const BUILD_INFO_PATH = `${extensionFolderPath}/modules/tavern/dist/tavern-build.json`;

let tavernCacheKey = '';
let frameReady = false;
let pendingMessages: PendingFrameMessage[] = [];
let messageHandlerInstalled = false;

async function loadTavernCacheKey(): Promise<string> {
    if (tavernCacheKey) {return tavernCacheKey;}
    tavernCacheKey = await loadFirstPartyIframeCacheKey(BUILD_INFO_PATH);
    return tavernCacheKey;
}

function getIframe(): HTMLIFrameElement | null {
    const iframe = document.getElementById(IFRAME_ID);
    return iframe instanceof HTMLIFrameElement ? iframe : null;
}

function postToFrame(type: string, payload: Record<string, unknown> = {}): boolean {
    const iframe = getIframe();
    if (!iframe?.contentWindow) {return false;}
    const message = { type, payload };
    if (!frameReady) {
        pendingMessages.push(message);
        return false;
    }
    return postToIframe(iframe, message, SOURCE_HOST);
}

function flushPendingMessages(): void {
    if (!frameReady) {return;}
    const iframe = getIframe();
    if (!iframe?.contentWindow) {return;}
    pendingMessages.forEach((message) => postToIframe(iframe, message, SOURCE_HOST));
    pendingMessages = [];
}

async function sendConfigToFrame(options: Record<string, unknown> = {}): Promise<void> {
    const contextPayload = await buildTavernContext(options);
    postToFrame('xb-tavern:config', await buildTavernFrameConfig(contextPayload as unknown as Record<string, unknown>));
}

async function refreshContext(options: Record<string, unknown> = {}): Promise<void> {
    postToFrame('xb-tavern:context', await buildTavernContext(options) as unknown as Record<string, unknown>);
}

async function saveConfigFromFrame(payload: Record<string, unknown> = {}): Promise<void> {
    const requestId = String(payload.requestId || '');
    const configPatch = payload.payload && typeof payload.payload === 'object'
        ? payload.payload as Record<string, unknown>
        : {};
    const result = await saveTavernAgentConfig(configPatch, { silent: false });
    postToFrame('xb-tavern:config-saved', {
        requestId,
        ok: result.ok,
        config: result.config,
        error: result.error || '',
    });
    if (result.ok) {
        await sendConfigToFrame();
    }
}

function replyHostResult(requestId = '', payload: Record<string, unknown> = {}): void {
    postToFrame('xb-tavern:host-result', {
        requestId,
        ...payload,
    });
}

function handleHostRequestHeaders(payload: Record<string, unknown> = {}): void {
    replyHostResult(String(payload.requestId || ''), {
        ok: true,
        hostRequestHeaders: getRequestHeaders?.() || {},
    });
}

async function createOverlay(): Promise<HTMLElement> {
    return createFirstPartyIframeOverlay({
        overlayId: OVERLAY_ID,
        iframeId: IFRAME_ID,
        htmlPath: HTML_PATH,
        version: await loadTavernCacheKey(),
    });
}

async function openTavern(): Promise<void> {
    if (document.getElementById(OVERLAY_ID)) {return;}
    frameReady = false;
    pendingMessages = [];
    installMessageHandler();
    await createOverlay();
}

function closeTavern(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {overlay.remove();}
    frameReady = false;
    pendingMessages = [];
}

function handleFrameMessage(event: MessageEvent): void {
    const iframe = getIframe();
    if (!isTrustedMessage(event, iframe, SOURCE_APP)) {return;}
    const data = event.data || {};
    switch (data.type) {
        case 'xb-tavern:frame-ready':
            frameReady = true;
            void sendConfigToFrame().then(flushPendingMessages);
            break;
        case 'xb-tavern:close':
            closeTavern();
            break;
        case 'xb-tavern:refresh-context':
            void refreshContext(data.payload || {});
            break;
        case 'xb-tavern:save-config':
            void saveConfigFromFrame(data.payload || {});
            break;
        case 'xb-tavern:get-host-request-headers':
            handleHostRequestHeaders(data.payload || {});
            break;
        default:
            break;
    }
}

function installMessageHandler(): void {
    if (messageHandlerInstalled) {return;}
    // Guarded by isTrustedMessage in handleFrameMessage.
    // eslint-disable-next-line no-restricted-syntax
    window.addEventListener('message', handleFrameMessage);
    messageHandlerInstalled = true;
}

export async function initTavern(): Promise<void> {
    installMessageHandler();
    window.xiaobaixTavern = {
        open: openTavern,
        close: closeTavern,
        refreshContext,
    };
}

export function cleanupTavern(): void {
    closeTavern();
}

export { openTavern, closeTavern };
