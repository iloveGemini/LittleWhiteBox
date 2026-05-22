import { normalizeEbookConfig } from './provider-config.js';

export function createEbookState() {
    return {
        config: normalizeEbookConfig({}),
        configDraft: null,
        books: [],
        book: null,
        files: [],
        selectedPath: '',
        readerPath: '',
        viewMode: 'library',
        editorContent: '',
        savedContent: '',
        messages: [],
        toolTrace: [],
        openToolTurnKeys: [],
        activeTurnStartIndex: -1,
        openThoughtKeys: [],
        editingMessageIndex: -1,
        messageActionFeedback: {},
        historySummary: '',
        archivedTurnCount: 0,
        isBusy: false,
        activeController: null,
        isSettingsOpen: false,
        configPage: 'main',
        configFormSyncPending: true,
        modelOptionsByProvider: {},
        pullStateByProvider: {},
        configSave: {
            status: 'idle',
            requestId: '',
            error: '',
        },
        status: '正在打开书架...',
        toast: '',
    };
}
