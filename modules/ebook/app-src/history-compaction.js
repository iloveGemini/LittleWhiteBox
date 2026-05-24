import { resolveConversationTokens } from '../../agent-core/runtime/context-tokens.js';
import { EBOOK_SUMMARY_SYSTEM_PROMPT } from './prompts.js';
import { resetMessageWindow } from '../../agent-core/ui/message-windowing.js';

export const EBOOK_MAX_CONTEXT_TOKENS = 188000;
export const EBOOK_SUMMARY_TRIGGER_TOKENS = 158000;
export const EBOOK_HISTORY_SUMMARY_MAX_TOKENS = 10000;
export const EBOOK_DEFAULT_PRESERVED_TURNS = 2;
export const EBOOK_MIN_PRESERVED_TURNS = 1;

export function splitEbookMessagesIntoTurns(messages = []) {
    const turns = [];
    let currentTurn = [];

    (messages || []).forEach((message) => {
        if (!message || !['user', 'assistant', 'tool'].includes(message.role)) return;
        if (message.role === 'user' && currentTurn.length) {
            turns.push(currentTurn);
            currentTurn = [message];
            return;
        }
        currentTurn.push(message);
    });

    if (currentTurn.length) {
        turns.push(currentTurn);
    }
    return turns.filter((turn) => turn.length);
}

function trimForFallback(text = '', limit = 12000) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, limit)}...`;
}

function normalizeSummarySourceText(text = '') {
    return String(text || '').replace(/\r\n/g, '\n').trim();
}

function getMessageTextForSummary(message = {}) {
    if (message.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
        const toolLines = message.toolCalls.map((toolCall) => {
            const name = String(toolCall?.name || '').trim();
            const args = String(toolCall?.arguments || '{}').trim();
            return `工具调用: ${name} ${args}`.trim();
        });
        return normalizeSummarySourceText([message.content || '', ...toolLines].filter(Boolean).join('\n'));
    }
    if (message.role === 'tool') {
        return normalizeSummarySourceText([
            `工具结果: ${message.toolName || message.toolCallId || 'unknown'}`,
            message.content || '',
        ].join('\n'));
    }
    return normalizeSummarySourceText(message.content || '');
}

function buildSummarySource(turns = [], existingSummary = '') {
    const lines = [];
    if (existingSummary?.trim()) {
        lines.push('已有创作记录（当前记忆底稿，除非新增历史明确纠正，否则需要合并保留）:');
        lines.push(existingSummary.trim());
        lines.push('');
    }

    turns.forEach((turn, index) => {
        lines.push(`第 ${index + 1} 段创作对话:`);
        turn.forEach((message) => {
            const roleLabel = message.role === 'user'
                ? '用户'
                : message.role === 'tool'
                    ? '工具'
                    : '电纸书';
            lines.push(`${roleLabel}: ${getMessageTextForSummary(message) || '[空]'}`);
        });
        lines.push('');
    });

    return lines.join('\n').trim();
}

function buildFallbackSummary(turns = [], existingSummary = '') {
    const sections = [];
    if (existingSummary?.trim()) {
        sections.push(existingSummary.trim());
    }
    turns.forEach((turn, index) => {
        const condensed = turn.map((message) => {
            const roleLabel = message.role === 'user'
                ? '用户'
                : message.role === 'tool'
                    ? '工具'
                    : '电纸书';
            return `${roleLabel}: ${getMessageTextForSummary(message) || '[空]'}`;
        }).join('\n');
        sections.push(`补充创作记录 ${index + 1}:\n${condensed}`);
    });
    return trimForFallback(sections.join('\n\n'), 16000);
}

function resolveSummaryMaxTokens(providerConfig = {}) {
    const configuredMaxTokens = Number(providerConfig?.maxTokens);
    if (Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0) {
        return Math.min(Math.floor(configuredMaxTokens), EBOOK_HISTORY_SUMMARY_MAX_TOKENS);
    }
    return EBOOK_HISTORY_SUMMARY_MAX_TOKENS;
}

export function createEbookHistoryCompactionController(deps = {}) {
    const {
        state,
        render = () => {},
        persistConversation = () => {},
        showToast = () => {},
        getActiveProviderConfig = () => ({}),
        buildProviderMessages = () => [],
        getToolDefinitions = () => [],
        summaryTriggerTokens = EBOOK_SUMMARY_TRIGGER_TOKENS,
        defaultPreservedTurns = EBOOK_DEFAULT_PRESERVED_TURNS,
        minPreservedTurns = EBOOK_MIN_PRESERVED_TURNS,
    } = deps;

    async function estimateCurrentTokens() {
        const providerConfig = getActiveProviderConfig();
        const toolDefinitions = getToolDefinitions();
        return await resolveConversationTokens({
            messages: buildProviderMessages(),
            tools: Array.isArray(toolDefinitions) ? toolDefinitions : [],
            providerConfig,
        });
    }

    function getActiveContextMessages() {
        const turns = splitEbookMessagesIntoTurns(state.messages);
        const archivedCount = Math.min(state.archivedTurnCount, turns.length);
        return turns.slice(archivedCount).flat();
    }

    function pruneArchivedTurnsFromState() {
        const turns = splitEbookMessagesIntoTurns(state.messages);
        const archivedCount = Math.min(state.archivedTurnCount, turns.length);
        if (archivedCount <= 0) return false;
        state.messages = turns.slice(archivedCount).flat();
        state.archivedTurnCount = 0;
        resetMessageWindow(state);
        return true;
    }

    function resetCompactionState() {
        state.archivedTurnCount = 0;
    }

    async function summarizeTurns(adapter, turnsToArchive, signal) {
        if (!turnsToArchive.length) return;
        const summarySource = buildSummarySource(turnsToArchive, state.historySummary);
        const fallbackSummary = buildFallbackSummary(turnsToArchive, state.historySummary);
        const providerConfig = getActiveProviderConfig();

        try {
            const result = await adapter.chat({
                systemPrompt: EBOOK_SUMMARY_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: summarySource }],
                tools: [],
                toolChoice: 'none',
                temperature: Math.min(Number(providerConfig.temperature ?? 0.2), 0.2),
                maxTokens: resolveSummaryMaxTokens(providerConfig),
                signal,
            });
            state.historySummary = String(result?.text || '').trim() || fallbackSummary;
        } catch {
            state.historySummary = fallbackSummary;
        }
    }

    async function ensureContextBudget(adapter, signal) {
        if (await estimateCurrentTokens() <= summaryTriggerTokens) {
            return;
        }

        for (const preservedTurns of [defaultPreservedTurns, minPreservedTurns]) {
            const turns = splitEbookMessagesIntoTurns(state.messages);
            const desiredArchivedTurnCount = Math.max(
                state.archivedTurnCount,
                turns.length - Math.min(preservedTurns, turns.length),
            );
            if (desiredArchivedTurnCount > state.archivedTurnCount) {
                const turnsToArchive = turns.slice(state.archivedTurnCount, desiredArchivedTurnCount);
                const previousStatus = state.status;
                state.status = '正在整理较早创作记录...';
                render();
                try {
                    await summarizeTurns(adapter, turnsToArchive, signal);
                } finally {
                    state.status = previousStatus || '就绪';
                    render();
                }
                state.archivedTurnCount = desiredArchivedTurnCount;
                pruneArchivedTurnsFromState();
                await persistConversation();
            }

            if (await estimateCurrentTokens() <= summaryTriggerTokens) {
                showToast('已整理较早创作记录，保留最近创作上下文。');
                render();
                return;
            }
        }

        showToast('最近几轮创作记录本身已经很长，建议把任务拆小一点。');
        render();
    }

    return {
        ensureContextBudget,
        estimateCurrentTokens,
        getActiveContextMessages,
        pruneArchivedTurnsFromState,
        resetCompactionState,
    };
}
