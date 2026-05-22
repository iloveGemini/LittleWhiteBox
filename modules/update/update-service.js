import { extensionTypes } from "../../../../../extensions.js";
import { getRequestHeaders } from "../../../../../../script.js";
import { EXT_ID, extensionFolderPath } from "../../core/constants.js";

export const DEFAULT_UPDATE_REPO_INFO = Object.freeze({
    owner: 'RT15548',
    repo: 'LittleWhiteBox',
    homePage: 'https://github.com/RT15548/LittleWhiteBox',
});

let updateRepoInfoPromise = null;

export function parseGitHubRepoInfo(homePage = '') {
    const match = String(homePage || '').match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!match) return null;
    const owner = match[1];
    const repo = match[2].replace(/\.git$/i, '');
    return {
        owner,
        repo,
        homePage: `https://github.com/${owner}/${repo}`,
    };
}

async function getLittleWhiteBoxRepoInfo() {
    if (!updateRepoInfoPromise) {
        updateRepoInfoPromise = (async () => {
            try {
                const manifestResponse = await fetch(`${extensionFolderPath}/manifest.json?t=${Date.now()}`, { cache: 'no-cache' });
                if (manifestResponse.ok) {
                    const manifest = await manifestResponse.json();
                    return parseGitHubRepoInfo(manifest?.homePage) || DEFAULT_UPDATE_REPO_INFO;
                }
            } catch {}
            return DEFAULT_UPDATE_REPO_INFO;
        })();
    }
    return await updateRepoInfoPromise;
}

function decodeBase64Utf8(value = '') {
    const normalized = String(value || '').replace(/\s+/g, '');
    if (!normalized) return '';
    try {
        const binary = atob(normalized);
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return '';
    }
}

function normalizeVersionLabel(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^v/, '')
        .replace(/[^\w.-]+/g, '');
}

function buildReleaseTagCandidates(targetVersion = '') {
    const raw = String(targetVersion || '').trim();
    if (!raw) return [];
    const withoutPrefix = raw.replace(/^v/i, '');
    return Array.from(new Set([raw, withoutPrefix, `v${withoutPrefix}`].filter(Boolean)));
}

async function fetchGitHubReleaseByTag(repoInfo, targetVersion = '') {
    if (!repoInfo?.owner || !repoInfo?.repo) return null;
    const target = normalizeVersionLabel(targetVersion);
    if (!target) return null;

    for (const tag of buildReleaseTagCandidates(targetVersion)) {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases/tags/${encodeURIComponent(tag)}?t=${Date.now()}`,
                { cache: 'no-cache' },
            );
            if (!response.ok) continue;
            const data = await response.json();
            const releaseTag = normalizeVersionLabel(data?.tag_name || '');
            if (releaseTag !== target) continue;
            return {
                source: 'release',
                title: String(data?.name || data?.tag_name || `版本 ${targetVersion}`),
                tagName: String(data?.tag_name || ''),
                markdown: String(data?.body || ''),
                htmlUrl: String(data?.html_url || `${repoInfo.homePage}/releases/tag/${encodeURIComponent(tag)}`),
                publishedAt: String(data?.published_at || ''),
            };
        } catch {}
    }
    return null;
}

export async function fetchLittleWhiteBoxUpdateNotes(targetVersion = '') {
    const repoInfo = await getLittleWhiteBoxRepoInfo();
    const release = await fetchGitHubReleaseByTag(repoInfo, targetVersion);
    if (release?.markdown?.trim()) {
        return {
            ...release,
            repoInfo,
            sourceLabel: 'GitHub Release',
        };
    }

    return {
        repoInfo,
        source: 'fallback',
        sourceLabel: '未匹配到 Release',
        title: targetVersion ? `版本 ${targetVersion}` : '发现可用更新',
        tagName: targetVersion,
        markdown: '链接不到对应 Release 的更新说明，请实际更新后体验。',
        htmlUrl: `${repoInfo.homePage}/releases`,
        publishedAt: '',
    };
}

async function detectLittleWhiteBoxGlobalFlag() {
    const extensionKey = `third-party/${EXT_ID}`;

    try {
        const response = await fetch('/api/extensions/discover', {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (response.ok) {
            const extensions = await response.json();
            const match = Array.isArray(extensions)
                ? extensions.find((ext) => ext?.name === extensionKey)
                : null;

            if (match?.type === 'global') return true;
            if (match?.type === 'local') return false;
        }
    } catch {}

    const cachedType = extensionTypes?.[extensionKey];
    if (cachedType === 'global') return true;
    if (cachedType === 'local') return false;

    return null;
}

async function requestLittleWhiteBoxUpdate(globalFlag) {
    return fetch('/api/extensions/update', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ extensionName: EXT_ID, global: globalFlag }),
    });
}

async function requestLittleWhiteBoxVersion(globalFlag) {
    return fetch('/api/extensions/version', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ extensionName: EXT_ID, global: globalFlag }),
    });
}

export async function checkLittleWhiteBoxUpdate() {
    const checkByManifestVersion = async () => {
        try {
            const timestamp = Date.now();
            const localRes = await fetch(`${extensionFolderPath}/manifest.json?t=${timestamp}`, { cache: 'no-cache' });
            if (!localRes.ok) return null;
            const localManifest = await localRes.json();
            const localVersion = localManifest.version;
            const repoInfo = parseGitHubRepoInfo(localManifest?.homePage) || DEFAULT_UPDATE_REPO_INFO;
            const remoteRes = await fetch(
                `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/manifest.json?t=${timestamp}`,
                { cache: 'no-cache' },
            );
            if (!remoteRes.ok) return null;
            const remoteData = await remoteRes.json();
            const remoteManifest = JSON.parse(decodeBase64Utf8(remoteData.content));
            const remoteVersion = remoteManifest.version;
            return localVersion !== remoteVersion
                ? { isUpToDate: false, localVersion, remoteVersion }
                : { isUpToDate: true, localVersion, remoteVersion };
        } catch {
            return null;
        }
    };

    try {
        const detectedGlobal = await detectLittleWhiteBoxGlobalFlag();
        const tryOrder = detectedGlobal === null ? [false, true] : [detectedGlobal, !detectedGlobal];

        for (let i = 0; i < tryOrder.length; i++) {
            const response = await requestLittleWhiteBoxVersion(tryOrder[i]);

            if (response.ok) {
                const data = await response.json();
                if (typeof data?.isUpToDate === 'boolean') {
                    return { ...data, source: 'git' };
                }
                break;
            }

            const text = await response.text();
            const shouldRetry = i === 0 && (
                response.status === 404
                || response.status === 403
                || /Directory does not exist|Forbidden|permission/i.test(text)
            );

            if (!shouldRetry) break;
        }
    } catch {}

    return checkByManifestVersion();
}

export async function updateLittleWhiteBoxExtension() {
    try {
        const detectedGlobal = await detectLittleWhiteBoxGlobalFlag();
        const tryOrder = detectedGlobal === null ? [false, true] : [detectedGlobal, !detectedGlobal];
        let response = null;

        for (let i = 0; i < tryOrder.length; i++) {
            const candidate = tryOrder[i];
            response = await requestLittleWhiteBoxUpdate(candidate);

            if (response.ok) break;

            const text = await response.text();
            const shouldRetry = i === 0 && (
                response.status === 404
                || response.status === 403
                || /Directory does not exist|Forbidden|permission/i.test(text)
            );

            if (!shouldRetry) {
                toastr.error(text || response.statusText, 'LittleWhiteBox update failed', { timeOut: 5000 });
                return false;
            }
        }

        if (!response.ok) {
            const text = await response.text();
            toastr.error(text || response.statusText, 'LittleWhiteBox update failed', { timeOut: 5000 });
            return false;
        }

        const data = await response.json();
        if (data.isUpToDate) {
            toastr.success('LittleWhiteBox is up to date');
            return true;
        }

        toastr.success('LittleWhiteBox updated，页面即将刷新', '正在应用更新');
        setTimeout(() => window.location.reload(), 1000);
        return true;
    } catch {
        toastr.error('Error during update', 'LittleWhiteBox update failed');
        return false;
    }
}
