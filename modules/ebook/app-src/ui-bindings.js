import { buildActionPrompt } from './prompts.js';
import { formatDraftMetrics } from './text-metrics.js';

const messageActionFeedbackTimers = new Map();

function isSendShortcut(event) {
    return event.key === 'Enter'
        && !event.isComposing
        && !event.shiftKey
        && !event.ctrlKey
        && !event.altKey
        && !event.metaKey;
}

function isSaveShortcut(event) {
    return String(event.key || '').toLowerCase() === 's' && (event.ctrlKey || event.metaKey);
}

function updateEditorMeta(root, state, bookController) {
    const meta = root.querySelector('#xb-editor-meta');
    if (!meta) return;
    meta.textContent = `${bookController.isEditorDirty() ? '有未保存修改' : '已保存到书库'} · ${formatDraftMetrics(state.editorContent || '')}`;
}

function updateComposeHint(root) {
    const hint = root.querySelector('#xb-compose-hint');
    if (!hint) return;
    hint.textContent = 'Enter 发送 · Shift+Enter 换行';
}

function updateOpenKeyList(list = [], key = '', open = false) {
    const normalizedKey = String(key || '').trim();
    const current = new Set(Array.isArray(list) ? list : []);
    if (!normalizedKey) return [...current];
    if (open) {
        current.add(normalizedKey);
    } else {
        current.delete(normalizedKey);
    }
    return [...current];
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

function isEditableAssistantTextMessage(message = {}) {
    return message
        && message.role === 'assistant'
        && !message.streaming
        && String(message.content || '').trim()
        && !(Array.isArray(message.toolCalls) && message.toolCalls.length);
}

export function bindEbookEvents(options = {}) {
    const {
        root,
        state,
        render,
        postToHost,
        bookController,
        agentRunner,
        persistConversation,
        clearConversation,
        showToast,
    } = options;
    if (!root) return;

    root.querySelector('#xb-close')?.addEventListener('click', () => postToHost('xb-ebook:close'));
    root.querySelector('#xb-library-link')?.addEventListener('click', () => void bookController.showLibrary());
    root.querySelector('#xb-library-new-book')?.addEventListener('click', () => void bookController.createNewBook());
    root.querySelector('#xb-library-open-current')?.addEventListener('click', () => void bookController.showBookEntry());
    root.querySelector('#xb-entry-link')?.addEventListener('click', () => void bookController.showBookEntry());
    root.querySelector('#xb-studio-link')?.addEventListener('click', () => void bookController.showStudio());
    root.querySelector('#xb-studio-empty-link')?.addEventListener('click', () => void bookController.showStudio());
    root.querySelector('#xb-reader-link')?.addEventListener('click', () => void bookController.showReader());
    root.querySelector('#xb-new-book')?.addEventListener('click', () => void bookController.createNewBook());
    root.querySelector('#xb-new-file')?.addEventListener('click', () => void bookController.createNewFile());
    root.querySelectorAll('[data-book-rename]').forEach((button) => {
        button.addEventListener('click', () => void bookController.renameCurrentBook());
    });
    root.querySelector('#xb-save')?.addEventListener('click', () => void bookController.saveCurrentFile());
    root.querySelector('#xb-agent-close')?.addEventListener('click', () => postToHost('xb-ebook:close'));
    root.querySelector('#xb-agent-open-settings')?.addEventListener('click', () => {
        state.isSettingsOpen = true;
        state.configFormSyncPending = true;
        render();
    });
    root.querySelector('#xb-agent-settings-close')?.addEventListener('click', () => {
        state.isSettingsOpen = false;
        render();
    });
    root.querySelector('#xb-agent-settings-overlay')?.addEventListener('click', (event) => {
        if (event.target !== event.currentTarget) return;
        state.isSettingsOpen = false;
        render();
    });
    root.querySelector('#xb-agent-clear')?.addEventListener('click', async () => {
        if (state.isBusy) return;
        await clearConversation?.(state.book?.id);
        showToast?.('创作对话已清空');
        render();
    });
    root.querySelectorAll('.xb-book').forEach((button) => {
        button.addEventListener('click', () => void bookController.selectBook(button.dataset.bookId || ''));
    });
    root.querySelectorAll('.xb-library-book').forEach((button) => {
        button.addEventListener('click', () => void bookController.selectBook(button.dataset.bookId || ''));
    });
    root.querySelectorAll('[data-entry-action]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.dataset.entryAction === 'reader') {
                void bookController.showReader();
                return;
            }
            void bookController.showStudio();
        });
    });
    root.querySelectorAll('[data-reader-path]').forEach((button) => {
        button.addEventListener('click', () => void bookController.selectReaderChapter(button.dataset.readerPath || ''));
    });
    root.querySelectorAll('.xb-file').forEach((button) => {
        button.addEventListener('click', () => void bookController.selectFile(button.dataset.path || ''));
    });
    root.querySelectorAll('[data-import]').forEach((button) => {
        button.addEventListener('click', () => void bookController.importMaterial(button.dataset.import || ''));
    });
    root.querySelectorAll('[data-home-action]').forEach((button) => {
        button.addEventListener('click', () => {
            switch (button.dataset.homeAction) {
                case 'start-writing':
                    void bookController.selectFile('book/chapters/001.md');
                    break;
                case 'open-outline':
                    void bookController.selectFile('book/outline.md');
                    break;
                case 'import-chat':
                    void bookController.importMaterial('chat');
                    break;
                case 'back-library':
                    void bookController.showLibrary();
                    break;
                default:
                    break;
            }
        });
    });
    root.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', () => {
            const promptText = buildActionPrompt(button.dataset.action || '', {
                selectedPath: state.selectedPath,
            });
            void agentRunner.runAgent(promptText);
        });
    });
    root.querySelectorAll('.xb-tool-turn[data-tool-turn-key]').forEach((details) => {
        details.addEventListener('toggle', () => {
            if (state.isBusy && details.dataset.autoOpenToolTurn === 'true') return;
            state.openToolTurnKeys = updateOpenKeyList(
                state.openToolTurnKeys,
                details.dataset.toolTurnKey || '',
                details.open,
            );
        });
    });
    root.querySelectorAll('.xb-thought-details[data-thought-key]').forEach((details) => {
        details.addEventListener('toggle', () => {
            if (state.isBusy && details.dataset.autoOpenThought === 'true') return;
            state.openThoughtKeys = updateOpenKeyList(
                state.openThoughtKeys,
                details.dataset.thoughtKey || '',
                details.open,
            );
        });
    });

    function flashMessageActionButton(messageIndex, action, ok) {
        if (!Number.isInteger(messageIndex) || messageIndex < 0 || !action) return;
        const feedbackKey = `${action}:${messageIndex}`;
        if (messageActionFeedbackTimers.has(feedbackKey)) {
            clearTimeout(messageActionFeedbackTimers.get(feedbackKey));
            messageActionFeedbackTimers.delete(feedbackKey);
        }
        state.messageActionFeedback = {
            ...(state.messageActionFeedback || {}),
            [feedbackKey]: ok ? 'success' : 'error',
        };
        render();
        const timer = window.setTimeout(() => {
            messageActionFeedbackTimers.delete(feedbackKey);
            const nextFeedback = { ...(state.messageActionFeedback || {}) };
            delete nextFeedback[feedbackKey];
            state.messageActionFeedback = nextFeedback;
            render();
        }, 1200);
        messageActionFeedbackTimers.set(feedbackKey, timer);
    }

    root.querySelectorAll('[data-message-action][data-message-index]').forEach((button) => {
        button.addEventListener('click', async () => {
            const messageIndex = Number.parseInt(button.dataset.messageIndex || '', 10);
            const action = String(button.dataset.messageAction || '').trim();
            if (!Number.isInteger(messageIndex) || messageIndex < 0 || !action) return;
            if (state.isBusy && action !== 'cancel-edit') return;
            const message = state.messages[messageIndex];
            if (!isEditableAssistantTextMessage(message)) return;

            if (action === 'copy') {
                const copied = await copyText(message.content);
                flashMessageActionButton(messageIndex, action, copied);
                showToast?.(copied ? '已复制整条消息' : '复制失败');
                return;
            }

            if (action === 'edit') {
                if (state.isBusy) return;
                state.editingMessageIndex = messageIndex;
                render();
                const textarea = root.querySelector(`.xb-msg[data-message-index="${messageIndex}"] .xb-msg-editor`);
                textarea?.focus();
                textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
                return;
            }

            if (action === 'cancel-edit') {
                state.editingMessageIndex = -1;
                render();
                return;
            }

            if (action === 'save-edit') {
                if (state.isBusy) return;
                const textarea = root.querySelector(`.xb-msg[data-message-index="${messageIndex}"] .xb-msg-editor`);
                const nextContent = String(textarea?.value || '').trim();
                if (!nextContent) {
                    showToast?.('消息内容不能为空');
                    return;
                }
                state.messages[messageIndex] = {
                    ...message,
                    content: nextContent,
                };
                state.editingMessageIndex = -1;
                await persistConversation?.(state.book?.id);
                showToast?.('消息已更新');
                render();
                return;
            }

            if (action === 'delete') {
                if (state.isBusy) return;
                state.messages.splice(messageIndex, 1);
                state.editingMessageIndex = -1;
                await persistConversation?.(state.book?.id);
                showToast?.('消息已删除');
                render();
                return;
            }

            if (action === 'reroll') {
                if (state.isBusy) return;
                const result = await agentRunner.rerunFromMessageIndex(messageIndex);
                if (result?.ok === false) {
                    showToast?.('这条消息前没有可重跑的用户输入');
                }
            }
        });
    });

    const editor = root.querySelector('#xb-editor-text');
    editor?.addEventListener('keydown', (event) => {
        if (!isSaveShortcut(event)) return;
        event.preventDefault();
        void bookController.saveCurrentFile();
    });
    editor?.addEventListener('input', () => {
        state.editorContent = editor.value;
        const saveButton = root.querySelector('#xb-save');
        if (saveButton) saveButton.disabled = state.isBusy || !bookController.isEditorDirty();
        updateEditorMeta(root, state, bookController);
    });

    const agentInput = root.querySelector('#xb-agent-input');
    agentInput?.addEventListener('input', () => updateComposeHint(root));
    agentInput?.addEventListener('keydown', (event) => {
        if (!isSendShortcut(event)) return;
        event.preventDefault();
        root.querySelector('#xb-agent-form')?.requestSubmit();
    });
    updateComposeHint(root);

    root.querySelector('#xb-agent-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        if (state.isBusy) {
            agentRunner.cancelActiveRun();
            return;
        }
        const input = root.querySelector('#xb-agent-input');
        const text = String(input?.value || '').trim();
        if (!text) return;
        input.value = '';
        void agentRunner.runAgent(buildActionPrompt('custom', { text, selectedPath: state.selectedPath }));
    });
}
