import { resolveConversationTokens } from '../../agent-core/runtime/context-tokens.js';
import { EBOOK_SUMMARY_SYSTEM_PROMPT } from './prompts.js';
import { resetMessageWindow } from '../../agent-core/ui/message-windowing.js';
import { EBOOK_TOOL_NAMES } from '../shared/tool-definitions.js';

export const EBOOK_MAX_CONTEXT_TOKENS = 188000;
export const EBOOK_SUMMARY_TRIGGER_TOKENS = 158000;
export const EBOOK_HISTORY_SUMMARY_MAX_TOKENS = 10000;
export const EBOOK_DEFAULT_PRESERVED_TURNS = 2;
export const EBOOK_MIN_PRESERVED_TURNS = 1;
const SUMMARY_TEXT_INLINE_LIMIT = 3000;
const SUMMARY_TEXT_SNIPPET_LIMIT = 600;
const SUMMARY_LARGE_TEXT_FIELDS = new Set([
    'content',
    'newString',
    'oldString',
    'text',
    'details',
    'result',
    'results',
]);

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

function safeJsonParse(value) {
    try {
        return JSON.parse(String(value || ''));
    } catch {
        return null;
    }
}

function summarizeLargeText(value = '') {
    const text = normalizeSummarySourceText(value);
    const lineCount = text ? text.split('\n').length : 0;
    return `[长文本已省略：${text.length} 字，${lineCount} 行。创作记录只保留工作结论，不保存正文原文。]`;
}

function summarizeTextForRecord(value = '', limit = SUMMARY_TEXT_INLINE_LIMIT) {
    const text = normalizeSummarySourceText(value);
    if (!text) return '';
    if (text.length <= limit) return text;
    return summarizeLargeText(text);
}

function summarizeJsonValueForRecord(value, path = '') {
    if (typeof value === 'string') {
        if (SUMMARY_LARGE_TEXT_FIELDS.has(path) || value.length > SUMMARY_TEXT_INLINE_LIMIT) {
            return summarizeLargeText(value);
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item, index) => summarizeJsonValueForRecord(item, `${path}[${index}]`));
    }
    if (value && typeof value === 'object') {
        const result = {};
        Object.entries(value).forEach(([key, entryValue]) => {
            result[key] = summarizeJsonValueForRecord(entryValue, key);
        });
        return result;
    }
    return value;
}

function summarizeToolArgumentsForRecord(toolName = '', rawArguments = '') {
    const args = safeJsonParse(rawArguments);
    if (!args || typeof args !== 'object') {
        return summarizeTextForRecord(rawArguments, SUMMARY_TEXT_SNIPPET_LIMIT);
    }
    const name = String(toolName || '').trim();
    if (name === EBOOK_TOOL_NAMES.WRITE) {
        const content = typeof args.content === 'string' ? args.content : String(args.content ?? '');
        return JSON.stringify({
            filePath: args.filePath || args.path || '',
            content: summarizeLargeText(content),
        });
    }
    if (name === EBOOK_TOOL_NAMES.EDIT) {
        const edits = Array.isArray(args.edits) ? args.edits : [];
        return JSON.stringify({
            filePath: args.filePath || '',
            edits: edits.map((edit = {}) => ({
                startLine: edit.startLine,
                endLine: edit.endLine,
                insertAtLine: edit.insertAtLine,
                oldString: typeof edit.oldString === 'string' ? summarizeLargeText(edit.oldString) : undefined,
                newString: typeof edit.newString === 'string' ? summarizeLargeText(edit.newString) : undefined,
            })),
        });
    }
    return JSON.stringify(summarizeJsonValueForRecord(args));
}

function summarizeToolResultForRecord(message = {}) {
    const parsed = safeJsonParse(message.content);
    const toolName = String(message.toolName || message.toolCallId || 'unknown');
    if (!parsed || typeof parsed !== 'object') {
        return [
            `工具结果: ${toolName}`,
            summarizeTextForRecord(message.content, SUMMARY_TEXT_SNIPPET_LIMIT),
        ].filter(Boolean).join('\n');
    }
    const summary = String(parsed.summary || parsed.message || parsed.error || '').trim();
    const compact = {
        ok: parsed.ok,
        path: parsed.path || parsed.filePath,
        summary: summary || undefined,
        lineStart: parsed.lineStart,
        lineEnd: parsed.lineEnd,
        totalLines: parsed.totalLines,
        editCount: parsed.editCount,
        appliedCount: parsed.appliedCount,
        satisfiedCount: parsed.satisfiedCount,
        failedCount: parsed.failedCount,
        definiteFailedCount: parsed.definiteFailedCount,
        uncertainCount: parsed.uncertainCount,
        changed: parsed.changed,
        bytes: parsed.bytes,
    };
    return [
        `工具结果: ${toolName}`,
        JSON.stringify(compact),
    ].join('\n');
}

function getMessageTextForSummary(message = {}) {
    if (message.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
        const toolLines = message.toolCalls.map((toolCall) => {
            const name = String(toolCall?.name || '').trim();
            const args = summarizeToolArgumentsForRecord(name, toolCall?.arguments || '{}');
            return `工具调用: ${name} ${args}`.trim();
        });
        return normalizeSummarySourceText([summarizeTextForRecord(message.content || ''), ...toolLines].filter(Boolean).join('\n'));
    }
    if (message.role === 'tool') {
        return normalizeSummarySourceText(summarizeToolResultForRecord(message));
    }
    return normalizeSummarySourceText(summarizeTextForRecord(message.content || ''));
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
        onCompactionStart = () => {},
        onCompactionProgress = () => {},
        onCompactionComplete = () => {},
        onCompactionUnable = () => {},
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
                messages: [
                    { role: 'system', content: EBOOK_SUMMARY_SYSTEM_PROMPT },
                    { role: 'user', content: summarySource },
                ],
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
        const initialTokens = await estimateCurrentTokens();
        if (initialTokens <= summaryTriggerTokens) {
            return;
        }
        onCompactionStart({
            currentTokens: initialTokens,
            triggerTokens: summaryTriggerTokens,
            status: '正在整理较早创作记录...',
        });

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
                onCompactionProgress({
                    currentTokens: initialTokens,
                    triggerTokens: summaryTriggerTokens,
                    status: '正在压缩重复创作脉络...',
                });
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

            const currentTokens = await estimateCurrentTokens();
            onCompactionProgress({
                currentTokens: initialTokens,
                yieldTokens: currentTokens,
                triggerTokens: summaryTriggerTokens,
                status: currentTokens <= summaryTriggerTokens
                    ? '创作记忆已建立。'
                    : '继续整理较早创作记录...',
            });
            if (currentTokens <= summaryTriggerTokens) {
                showToast('已整理较早创作记录，保留最近创作上下文。');
                onCompactionComplete({
                    currentTokens: initialTokens,
                    yieldTokens: currentTokens,
                    triggerTokens: summaryTriggerTokens,
                    status: '创作记忆已建立。',
                });
                render();
                return;
            }
        }

        showToast('最近几轮创作记录本身已经很长，建议把任务拆小一点。');
        onCompactionUnable({
            currentTokens: initialTokens,
            triggerTokens: summaryTriggerTokens,
            status: '最近创作记录仍然过长。',
        });
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
