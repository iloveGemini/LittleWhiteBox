let markdownConverter = null;
let markdownConverterSource = null;
let htmlBlockSerial = 0;
const htmlBlockStore = new Map();

const HTML_BLOCK_LANGUAGES = new Set(['html', 'htm', 'xhtml', 'xml', 'svg', 'vue', 'svelte']);
const SAFE_MARKDOWN_HTML_TAGS = new Set(['details', 'summary']);
export const HTML_PREVIEW_SANDBOX = 'allow-scripts';

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createHtmlBlockId() {
    htmlBlockSerial += 1;
    return `html-${Date.now().toString(36)}-${htmlBlockSerial.toString(36)}`;
}

function formatHtmlBlockSize(code = '') {
    const chars = String(code || '').length;
    if (chars >= 1000) {
        const scaled = chars / 1000;
        return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1)}k 字符`;
    }
    return `${chars} 字符`;
}

function getMarkdownLibraries() {
    return {
        showdown: globalThis.parent?.showdown || globalThis.showdown,
        DOMPurify: globalThis.parent?.DOMPurify || globalThis.DOMPurify,
    };
}

function isHtmlBlockLanguage(language = '') {
    return HTML_BLOCK_LANGUAGES.has(String(language || '').trim().toLowerCase());
}

function looksLikeHtmlCode(code = '') {
    const text = String(code || '').trim();
    if (!text) return false;
    if (/^<!doctype\s+html/i.test(text)) return true;
    if (/^<html[\s>]/i.test(text)) return true;
    const tagMatches = text.match(/<\/?[a-z][\w:-]*(?:\s[^<>]*)?>/gi) || [];
    return tagMatches.length >= 3 && /<\/[a-z][\w:-]*>/i.test(text);
}

function looksLikeStandaloneHtmlDocument(code = '') {
    const text = String(code || '').trim();
    return /^<!doctype\s+html/i.test(text) || /^<html[\s>]/i.test(text);
}

function storeHtmlBlock(code = '', language = 'html') {
    const id = createHtmlBlockId();
    htmlBlockStore.set(id, {
        code: String(code || ''),
        language: String(language || 'html').trim() || 'html',
    });
    return `@@XBHTMLBLOCK:${id}@@`;
}

function escapeRawHtmlTags(text = '', options = {}) {
    const allowSafeHtmlTags = options.allowSafeHtmlTags === true;
    return String(text || '').replace(/<\/?([a-z][\w:-]*)(?:\s[^<>]*)?>/gi, (match, tagName) => {
        const normalized = String(tagName || '').toLowerCase();
        if (allowSafeHtmlTags && SAFE_MARKDOWN_HTML_TAGS.has(normalized)) {
            return match;
        }
        return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });
}

function preprocessNonFenceMarkdown(text = '', options = {}) {
    const segment = String(text || '');
    const trimmed = segment.trim();
    if (looksLikeStandaloneHtmlDocument(trimmed)) {
        const leading = segment.match(/^\s*/)?.[0] || '';
        const trailing = segment.match(/\s*$/)?.[0] || '';
        return `${leading}${storeHtmlBlock(trimmed, 'html')}${trailing}`;
    }
    return escapeRawHtmlTags(segment, options);
}

function preprocessMarkdownInput(raw = '', options = {}) {
    const text = String(raw || '');
    const fenceRegex = /(^|\n)(`{3,}|~{3,})[ \t]*([^\n]*)\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g;
    let result = '';
    let lastIndex = 0;
    let match = null;

    while ((match = fenceRegex.exec(text)) !== null) {
        const leadingBreak = match[1] || '';
        const blockStart = match.index + leadingBreak.length;
        const fenceEnd = fenceRegex.lastIndex;
        const rawLanguage = String(match[3] || '').trim().split(/\s+/)[0] || '';
        const code = String(match[4] || '');
        const shouldFoldAsHtml = isHtmlBlockLanguage(rawLanguage) || (!rawLanguage && looksLikeHtmlCode(code));

        result += preprocessNonFenceMarkdown(text.slice(lastIndex, blockStart), options);
        if (shouldFoldAsHtml) {
            result += storeHtmlBlock(code, rawLanguage || 'html');
        } else {
            result += text.slice(blockStart, fenceEnd);
        }
        lastIndex = fenceEnd;
    }

    result += preprocessNonFenceMarkdown(text.slice(lastIndex), options);
    return result;
}

function injectHtmlBlockPlaceholders(html = '') {
    return String(html || '').replace(/@@XBHTMLBLOCK:([a-z0-9-]+)@@|@@XB_HTML_BLOCK_([a-z0-9-]+)@@/g, (_match, id, legacyId) => (
        `<span class="xb-markdown-html-placeholder" data-xb-html-block-id="${id || legacyId}"></span>`
    ));
}

export function renderMarkdownToHtml(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const { showdown, DOMPurify } = getMarkdownLibraries();
    const markdownText = preprocessMarkdownInput(raw, {
        allowSafeHtmlTags: !!DOMPurify?.sanitize,
    });

    try {
        if (showdown?.Converter && DOMPurify?.sanitize) {
            if (!markdownConverter || markdownConverterSource !== showdown) {
                markdownConverterSource = showdown;
                markdownConverter = new showdown.Converter({
                    simpleLineBreaks: true,
                    strikethrough: true,
                    tables: true,
                    tasklists: true,
                    ghCodeBlocks: true,
                    simplifiedAutoLink: true,
                    openLinksInNewWindow: true,
                    emoji: false,
                    });
                }
            const html = markdownConverter.makeHtml(markdownText);
            const sanitized = DOMPurify.sanitize(html, {
                USE_PROFILES: { html: true },
                FORBID_TAGS: ['style', 'script'],
            });
            return injectHtmlBlockPlaceholders(sanitized);
        }
    } catch {
        // Fall through to escaped plain text below.
    }

    return injectHtmlBlockPlaceholders(escapeHtml(markdownText).replace(/\n/g, '<br>'));
}

async function copyText(text = '') {
    const normalized = String(text || '');
    if (!normalized) return false;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(normalized);
            return true;
        }
    } catch {
        // Fall through to the legacy copy path.
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = normalized;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const copied = document.execCommand('copy');
        textarea.remove();
        return copied;
    } catch {
        return false;
    }
}

export function enhancePathLinks(rootNode, options = {}) {
    if (!rootNode || typeof options.onPathClick !== 'function') return;

    const doc = rootNode.ownerDocument || globalThis.document;
    const nodeFilter = doc?.defaultView?.NodeFilter || globalThis.NodeFilter;
    if (!doc?.createTreeWalker || !nodeFilter) return;

    const pathRegex = options.pathRegex || /local\/[^\s`"'<>，。；：！？（）()[\]{}]+/g;
    const linkClassName = String(options.linkClassName || 'xb-markdown-local-path-link');
    const walker = doc.createTreeWalker(rootNode, nodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node?.nodeValue || !String(node.nodeValue).includes('local/')) continue;
        const parent = node.parentElement;
        if (parent?.closest?.('button, a, textarea, input')) continue;
        textNodes.push(node);
    }

    textNodes.forEach((node) => {
        const text = String(node.nodeValue || '');
        const fragment = doc.createDocumentFragment();
        let match = null;
        let lastIndex = 0;
        let replaced = false;
        pathRegex.lastIndex = 0;

        while ((match = pathRegex.exec(text)) !== null) {
            replaced = true;
            if (match.index > lastIndex) {
                fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
            }

            const matchedPath = match[0];
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = linkClassName;
            button.textContent = matchedPath;
            button.addEventListener('click', () => {
                options.onPathClick(matchedPath);
            });
            fragment.appendChild(button);
            lastIndex = match.index + matchedPath.length;
        }

        if (!replaced) return;
        if (lastIndex < text.length) {
            fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
        }
        node.parentNode?.replaceChild(fragment, node);
    });
}

export function enhanceMarkdownCodeBlocks(rootNode, options = {}) {
    if (!rootNode?.querySelectorAll) return;

    const doc = rootNode.ownerDocument || globalThis.document;
    if (!doc?.createElement) return;

    const codeBlockClassName = String(options.codeBlockClassName || 'xb-markdown-codeblock');
    const codeCopyClassName = String(options.codeCopyClassName || 'xb-markdown-code-copy');
    const copyButtonTitle = String(options.copyButtonTitle || '复制代码');
    const copySuccessTitle = String(options.copySuccessTitle || '已复制');
    const copyFailureTitle = String(options.copyFailureTitle || '复制失败');

    Array.from(rootNode.querySelectorAll('pre')).forEach((pre) => {
        if (pre.closest(`.${codeBlockClassName}`)) return;

        const wrapper = doc.createElement('div');
        wrapper.className = codeBlockClassName;

        const copyButton = doc.createElement('button');
        copyButton.type = 'button';
        copyButton.className = codeCopyClassName;
        copyButton.textContent = '⧉';
        copyButton.title = copyButtonTitle;
        copyButton.setAttribute('aria-label', copyButtonTitle);
        copyButton.addEventListener('click', async () => {
            const codeText = pre.querySelector('code')?.textContent || pre.textContent || '';
            const copied = await copyText(codeText);
            copyButton.textContent = copied ? '✓' : '!';
            copyButton.title = copied ? copySuccessTitle : copyFailureTitle;
            setTimeout(() => {
                copyButton.textContent = '⧉';
                copyButton.title = copyButtonTitle;
            }, 1200);
        });

        pre.parentNode?.insertBefore(wrapper, pre);
        wrapper.append(copyButton, pre);
    });
}

function clearActiveHtmlBlockButtons(buttons = [], activeButton = null) {
    buttons.forEach((button) => {
        button.classList.toggle('is-active', button === activeButton);
        button.setAttribute('aria-pressed', button === activeButton ? 'true' : 'false');
    });
}

function buildHtmlCodeView(doc, code = '') {
    const pre = doc.createElement('pre');
    pre.className = 'xb-markdown-html-code';
    pre.textContent = String(code || '');
    return pre;
}

function buildHtmlPreview(doc, code = '') {
    const iframe = doc.createElement('iframe');
    iframe.className = 'xb-markdown-html-preview';
    iframe.setAttribute('sandbox', HTML_PREVIEW_SANDBOX);
    iframe.referrerPolicy = 'no-referrer';
    iframe.title = 'HTML 渲染预览';
    // Scripts can run inside the preview iframe, but the sandbox still keeps it isolated
    // from the host because we do not grant same-origin, forms, popups, or top navigation.
    // eslint-disable-next-line no-unsanitized/property
    iframe.srcdoc = String(code || '');
    return iframe;
}

function createHtmlBlockNode(doc, entry = {}, options = {}) {
    const code = String(entry.code || '');
    if (options.htmlBlockMode === 'preview') {
        const block = doc.createElement('div');
        block.className = 'xb-markdown-html-block xb-markdown-html-block-auto';
        const body = doc.createElement('div');
        body.className = 'xb-markdown-html-body';
        body.append(buildHtmlPreview(doc, code));
        block.append(body);
        return block;
    }

    const block = doc.createElement('div');
    block.className = 'xb-markdown-html-block';

    const header = doc.createElement('div');
    header.className = 'xb-markdown-html-head';

    const title = doc.createElement('div');
    title.className = 'xb-markdown-html-title';
    title.textContent = 'HTML 片段';

    const meta = doc.createElement('span');
    meta.textContent = formatHtmlBlockSize(code);
    title.appendChild(meta);

    const actions = doc.createElement('div');
    actions.className = 'xb-markdown-html-actions';

    const codeButton = doc.createElement('button');
    codeButton.type = 'button';
    codeButton.textContent = '显示代码';
    codeButton.setAttribute('aria-pressed', 'false');

    const previewButton = doc.createElement('button');
    previewButton.type = 'button';
    previewButton.textContent = '渲染预览';
    previewButton.setAttribute('aria-pressed', 'false');

    actions.append(codeButton, previewButton);
    header.append(title, actions);

    const body = doc.createElement('div');
    body.className = 'xb-markdown-html-body';
    body.hidden = true;

    let activeMode = '';
    const buttons = [codeButton, previewButton];
    const renderMode = (mode) => {
        if (activeMode === mode) {
            activeMode = '';
            body.hidden = true;
            body.replaceChildren();
            clearActiveHtmlBlockButtons(buttons);
            return;
        }
        activeMode = mode;
        body.hidden = false;
        body.replaceChildren(mode === 'preview'
            ? buildHtmlPreview(doc, code)
            : buildHtmlCodeView(doc, code));
        clearActiveHtmlBlockButtons(buttons, mode === 'preview' ? previewButton : codeButton);
    };

    codeButton.addEventListener('click', () => renderMode('code'));
    previewButton.addEventListener('click', () => renderMode('preview'));

    block.append(header, body);
    return block;
}

export function enhanceHtmlBlocks(rootNode, options = {}) {
    if (!rootNode?.querySelectorAll) return;

    const doc = rootNode.ownerDocument || globalThis.document;
    if (!doc?.createElement) return;

    Array.from(rootNode.querySelectorAll('.xb-markdown-html-placeholder[data-xb-html-block-id]')).forEach((placeholder) => {
        const id = String(placeholder.getAttribute('data-xb-html-block-id') || '');
        const entry = htmlBlockStore.get(id);
        htmlBlockStore.delete(id);
        if (!entry) {
            placeholder.remove();
            return;
        }

        const node = createHtmlBlockNode(doc, entry, options);
        const parent = placeholder.parentElement;
        if (parent?.tagName === 'P' && parent.textContent.trim() === '') {
            parent.replaceWith(node);
            return;
        }
        placeholder.replaceWith(node);
    });
}

export function enhanceMarkdownContent(rootNode, options = {}) {
    if (!rootNode) return rootNode;
    enhanceHtmlBlocks(rootNode, options);
    enhanceMarkdownCodeBlocks(rootNode, options);
    enhancePathLinks(rootNode, options);
    return rootNode;
}

export function buildMarkdownFragment(text, options = {}) {
    const html = renderMarkdownToHtml(text);
    const doc = globalThis.document;
    if (!doc?.createElement) {
        return null;
    }

    const template = doc.createElement('template');
    // `html` is sanitized by renderMarkdownToHtml() above before being inserted.
    // eslint-disable-next-line no-unsanitized/property
    template.innerHTML = html;
    const fragment = template.content.cloneNode(true);
    enhanceMarkdownContent(fragment, options);
    return fragment;
}
