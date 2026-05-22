import { callGenericPopup, POPUP_TYPE } from "../../../../../popup.js";
import { buildMarkdownFragment } from "../agent-core/ui/message-markdown.js";
import {
    DEFAULT_UPDATE_REPO_INFO,
    checkLittleWhiteBoxUpdate,
    fetchLittleWhiteBoxUpdateNotes,
    updateLittleWhiteBoxExtension,
} from "./update-service.js";

let updateCheckPerformed = false;

function formatUpdateDate(value = '') {
    if (!value) return '';
    try {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString('zh-CN', { hour12: false });
        }
    } catch {}
    return '';
}

function ensureUpdatePopupStyles() {
    if (document.getElementById('xiaobaix-update-popup-style')) return;
    const style = document.createElement('style');
    style.id = 'xiaobaix-update-popup-style';
    style.textContent = `
        .lwb-update-popup {
            display: flex;
            flex-direction: column;
            gap: 14px;
            min-width: min(760px, calc(100vw - 56px));
            max-width: min(960px, calc(100vw - 32px));
        }
        .lwb-update-popup-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
        }
        .lwb-update-popup-title {
            font-size: 1.05rem;
            font-weight: 700;
            margin: 0;
        }
        .lwb-update-popup-subtitle {
            margin: 6px 0 0;
            opacity: 0.82;
            line-height: 1.5;
        }
        .lwb-update-popup-chips {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .lwb-update-popup-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid var(--SmartThemeBorderColor);
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 80%, transparent);
            font-size: 12px;
            line-height: 1.2;
        }
        .lwb-update-popup-chip-label {
            opacity: 0.7;
        }
        .lwb-update-popup-card {
            border: 1px solid var(--SmartThemeBorderColor);
            border-radius: 8px;
            padding: 12px 14px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 75%, transparent);
        }
        .lwb-update-popup-card-title {
            font-size: 13px;
            font-weight: 700;
            opacity: 0.78;
            margin: 0 0 10px;
        }
        .lwb-update-popup-notes {
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: min(56vh, 620px);
            overflow: auto;
            line-height: 1.6;
        }
        .lwb-update-popup-notes > *:first-child {
            margin-top: 0;
        }
        .lwb-update-popup-notes > *:last-child {
            margin-bottom: 0;
        }
        .lwb-update-popup-notes p,
        .lwb-update-popup-notes ul,
        .lwb-update-popup-notes ol,
        .lwb-update-popup-notes pre,
        .lwb-update-popup-notes table,
        .lwb-update-popup-notes blockquote,
        .lwb-update-popup-notes h1,
        .lwb-update-popup-notes h2,
        .lwb-update-popup-notes h3,
        .lwb-update-popup-notes h4 {
            margin: 0 0 10px;
        }
        .lwb-update-popup-notes ul,
        .lwb-update-popup-notes ol {
            padding-left: 1.4em;
        }
        .lwb-update-popup-notes pre {
            padding: 10px 12px;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.2);
            overflow: auto;
        }
        .lwb-update-popup-notes code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .lwb-update-popup-notes a,
        .lwb-update-popup-link {
            color: var(--SmartThemeQuoteColor, #6ab0ff);
        }
        .lwb-update-popup-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
        }
        .lwb-update-popup-hint {
            opacity: 0.72;
            line-height: 1.5;
        }
        @media (max-width: 820px) {
            .lwb-update-popup {
                min-width: 0;
                max-width: 100%;
            }
            .lwb-update-popup-notes {
                max-height: 48vh;
            }
        }
    `;
    document.head.appendChild(style);
}

function createUpdateChip(label, value) {
    if (!value) return null;
    const chip = document.createElement('div');
    chip.className = 'lwb-update-popup-chip';

    const key = document.createElement('span');
    key.className = 'lwb-update-popup-chip-label';
    key.textContent = `${label}:`;

    const text = document.createElement('strong');
    text.textContent = value;

    chip.append(key, text);
    return chip;
}

function buildLittleWhiteBoxUpdatePopup(versionData = {}, notesData = {}) {
    ensureUpdatePopupStyles();

    const currentVersion = String(versionData?.localVersion || '');
    const nextVersion = String(versionData?.remoteVersion || notesData?.tagName || '');
    const releaseTitle = String(notesData?.title || (nextVersion ? `版本 ${nextVersion}` : '发现可用更新'));
    const publishedAt = formatUpdateDate(notesData?.publishedAt);

    const root = document.createElement('div');
    root.className = 'lwb-update-popup';

    const header = document.createElement('div');
    header.className = 'lwb-update-popup-header';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'lwb-update-popup-title';
    title.textContent = releaseTitle;

    const subtitle = document.createElement('p');
    subtitle.className = 'lwb-update-popup-subtitle';
    subtitle.textContent = nextVersion
        ? `准备把 LittleWhiteBox 从 ${currentVersion || '当前版本'} 更新到 ${nextVersion}。先看一眼这次发布说明，再决定要不要现在更新。`
        : '检测到可用更新。先看一眼这次发布说明，再决定要不要现在更新。';

    titleWrap.append(title, subtitle);

    const chips = document.createElement('div');
    chips.className = 'lwb-update-popup-chips';
    [
        createUpdateChip('当前版本', currentVersion || '未知'),
        createUpdateChip('最新版本', nextVersion || '未知'),
        createUpdateChip('说明来源', notesData?.sourceLabel || '未配置'),
        createUpdateChip('发布时间', publishedAt),
    ].filter(Boolean).forEach((chip) => chips.appendChild(chip));

    header.append(titleWrap, chips);

    const notesCard = document.createElement('div');
    notesCard.className = 'lwb-update-popup-card';

    const notesTitle = document.createElement('div');
    notesTitle.className = 'lwb-update-popup-card-title';
    notesTitle.textContent = '更新说明';

    const notesBody = document.createElement('div');
    notesBody.className = 'lwb-update-popup-notes';
    if (notesData?.markdown?.trim()) {
        const fragment = buildMarkdownFragment(notesData.markdown);
        if (fragment) {
            notesBody.appendChild(fragment);
        } else {
            notesBody.textContent = notesData.markdown;
        }
    } else {
        const fallback = document.createElement('p');
        fallback.textContent = '这次更新还没有配置可展示的发布说明，但你仍然可以继续更新。';
        notesBody.appendChild(fallback);
    }

    notesCard.append(notesTitle, notesBody);

    const footer = document.createElement('div');
    footer.className = 'lwb-update-popup-footer';

    const hint = document.createElement('div');
    hint.className = 'lwb-update-popup-hint';
    hint.textContent = '点击“立即更新”后会执行现有更新流程，并在完成后自动刷新页面。';

    const link = document.createElement('a');
    link.className = 'lwb-update-popup-link';
    link.href = String(notesData?.htmlUrl || notesData?.repoInfo?.homePage || DEFAULT_UPDATE_REPO_INFO.homePage);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '查看发布页';

    footer.append(hint, link);
    root.append(header, notesCard, footer);
    return root;
}

function addUpdateTextNotice() {
    const selectors = [
        '.inline-drawer-toggle.inline-drawer-header b',
        '.inline-drawer-header b',
        '.littlewhitebox .inline-drawer-header b',
        'div[class*="inline-drawer"] b',
    ];
    let headerElement = null;
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            if (element.textContent && element.textContent.includes('小白X')) {
                headerElement = element;
                break;
            }
        }
        if (headerElement) break;
    }
    if (!headerElement) {
        setTimeout(() => addUpdateTextNotice(), 1000);
        return;
    }
    if (headerElement.querySelector('.littlewhitebox-update-text')) return;
    const updateTextSmall = document.createElement('small');
    updateTextSmall.className = 'littlewhitebox-update-text';
    updateTextSmall.textContent = '(有可用更新)';
    headerElement.appendChild(updateTextSmall);
}

function addUpdateDownloadButton() {
    const sectionDividers = document.querySelectorAll('.section-divider');
    let totalSwitchDivider = null;
    for (const divider of sectionDividers) {
        if (divider.textContent && divider.textContent.includes('总开关')) {
            totalSwitchDivider = divider;
            break;
        }
    }
    if (!totalSwitchDivider) {
        setTimeout(() => addUpdateDownloadButton(), 1000);
        return;
    }
    if (document.querySelector('#littlewhitebox-update-extension')) return;
    const updateButton = document.createElement('div');
    updateButton.id = 'littlewhitebox-update-extension';
    updateButton.className = 'menu_button fa-solid fa-cloud-arrow-down interactable has-update';
    updateButton.title = '查看更新说明并安装小白X更新';
    updateButton.tabIndex = 0;
    try {
        totalSwitchDivider.style.display = 'flex';
        totalSwitchDivider.style.alignItems = 'center';
        totalSwitchDivider.style.justifyContent = 'flex-start';
    } catch {}
    totalSwitchDivider.appendChild(updateButton);
    try {
        if (window.setupUpdateButtonInSettings) {
            window.setupUpdateButtonInSettings();
        }
    } catch {}
}

export function updateExtensionHeaderWithUpdateNotice() {
    addUpdateTextNotice();
    addUpdateDownloadButton();
}

export function removeAllUpdateNotices() {
    const textNotice = document.querySelector('.littlewhitebox-update-text');
    const downloadButton = document.querySelector('#littlewhitebox-update-extension');
    if (textNotice) textNotice.remove();
    if (downloadButton) downloadButton.remove();
}

export function resetLittleWhiteBoxUpdateCheck() {
    updateCheckPerformed = false;
}

export async function showLittleWhiteBoxUpdateDialog() {
    const versionData = await checkLittleWhiteBoxUpdate();
    if (versionData?.isUpToDate === true) {
        removeAllUpdateNotices();
        toastr.success('LittleWhiteBox is up to date');
        return true;
    }

    const notesData = await fetchLittleWhiteBoxUpdateNotes(versionData?.remoteVersion || '');
    const confirmed = await callGenericPopup(
        buildLittleWhiteBoxUpdatePopup(versionData || {}, notesData),
        POPUP_TYPE.CONFIRM,
        '',
        {
            okButton: '立即更新',
            cancelButton: '稍后',
            wide: true,
            wider: true,
            large: true,
            allowVerticalScrolling: true,
        },
    );
    if (!confirmed) return false;

    const ok = await updateLittleWhiteBoxExtension();
    if (ok) {
        removeAllUpdateNotices();
    }
    return ok;
}

export async function performExtensionUpdateCheck() {
    if (updateCheckPerformed) return;
    updateCheckPerformed = true;
    try {
        const versionData = await checkLittleWhiteBoxUpdate();
        if (versionData && versionData.isUpToDate === false) {
            updateExtensionHeaderWithUpdateNotice();
        }
    } catch {}
}
