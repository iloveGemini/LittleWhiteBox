import { createAgentAdapter, resolveActiveProviderConfig } from '../../../agent-core/provider-config.js';
import * as contextTokens from '../../../agent-core/runtime/context-tokens.js';
import {
    buildProviderAssistantToolCallMessage,
    hasVisibleText,
    resolveResultToolCalls,
} from '../../../agent-core/runtime/protocol.js';
import type { XbTavernMessage } from '../../shared/message-assembler';
import { buildTavernManagerSystemPrompt, type TavernAssistantPreset } from '../../shared/assistant-presets';
import {
    ensureTavernMemoryDefaults,
    executeTavernMemoryTool,
    getTavernManagerToolDefinitions,
    listTavernMemoryFiles,
    rebuildTavernMemoryDerivedIndex,
    type TavernMemoryToolResult,
} from '../../shared/memory-files';
import {
    createTavernManagerRun,
    deleteTavernManagerMessages,
    listTavernEpisodeSummaries,
    listTavernManagerMemorySnapshots,
    listTavernManagerMessages,
    listTavernMessages,
    listTavernTurnSummaries,
    rollbackManagerRunMemoryWrites,
    rollbackManagerRunsForMessageRange,
    updateTavernManagerRun,
    type TavernEpisodeSummaryRecord,
    type TavernManagerMessageRecord,
    type TavernManagerRunRecord,
    type TavernMessageRecord,
    type TavernTurnSummaryRecord,
} from '../../shared/session-db';
import { getXbTavernProviderLabel } from './provider';

const resolveConversationTokens = (contextTokens as unknown as {
    resolveConversationTokens: (input: {
        messages?: XbTavernMessage[];
        tools?: unknown[] | null;
        providerConfig?: Record<string, unknown>;
    }) => Promise<number>;
}).resolveConversationTokens;

export interface XbTavernManagerOnceOptions {
    agentConfig: Record<string, unknown>;
    messages: XbTavernMessage[];
    tools?: unknown[];
    toolChoice?: 'auto' | 'none' | string;
    signal?: AbortSignal;
    onStreamProgress?: (text: string) => void;
}

export interface XbTavernManagerOnceResult {
    text: string;
    provider?: string;
    model?: string;
    toolCalls?: unknown[];
    providerPayload?: unknown;
}

export interface XbTavernManagerRunInput {
    sessionId: string;
    agentConfig: Record<string, unknown>;
    userMessage: TavernMessageRecord;
    assistantMessage: TavernMessageRecord;
    turn: number;
    trigger?: string;
    managerRunId?: string;
    recentTurnSummaries?: TavernTurnSummaryRecord[];
    recentEpisodeSummaries?: TavernEpisodeSummaryRecord[];
    assistantPreset?: TavernAssistantPreset;
    signal?: AbortSignal;
    executeManagerOnce?: (options: XbTavernManagerOnceOptions) => Promise<XbTavernManagerOnceResult>;
}

export interface XbTavernManagerRunResult {
    ok: boolean;
    managerRun: TavernManagerRunRecord;
    turnSummary?: TavernTurnSummaryRecord;
    episodeSummary?: TavernEpisodeSummaryRecord;
    changedFiles?: string[];
    error?: string;
}

export interface XbTavernManagerScheduleResult {
    managerRunId: string;
    managerStatus: TavernManagerRunRecord['status'];
    completion?: Promise<XbTavernManagerRunResult>;
}

export interface XbTavernManagerChatInput {
    sessionId: string;
    agentConfig: Record<string, unknown>;
    question: string;
    history?: TavernManagerMessageRecord[];
    turn?: number;
    trigger?: string;
    assistantPreset?: TavernAssistantPreset;
    signal?: AbortSignal;
    executeManagerOnce?: (options: XbTavernManagerOnceOptions) => Promise<XbTavernManagerOnceResult>;
    onStreamProgress?: (text: string) => void;
}

export interface XbTavernManagerChatResult {
    ok: boolean;
    managerRun: TavernManagerRunRecord;
    text: string;
    provider: string;
    model: string;
    changedFiles: string[];
    error?: string;
}

export interface XbTavernManagerCompactionSnapshot {
    currentTokens: number;
    yieldTokens?: number;
    triggerTokens: number;
    status: string;
    preservedTurns?: number;
}

export interface EnsureTavernManagerChatBudgetInput {
    sessionId: string;
    agentConfig: Record<string, unknown>;
    assistantPreset?: TavernAssistantPreset;
    question: string;
    signal?: AbortSignal;
    onCompactionStart?: (snapshot: XbTavernManagerCompactionSnapshot) => void;
    onCompactionProgress?: (snapshot: XbTavernManagerCompactionSnapshot) => void;
    onCompactionComplete?: (snapshot: XbTavernManagerCompactionSnapshot) => void;
    onCompactionUnable?: (snapshot: XbTavernManagerCompactionSnapshot) => void;
}

export const TAVERN_MANAGER_MAX_CONTEXT_TOKENS = 188000;
export const TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS = 158000;
export const TAVERN_MANAGER_DEFAULT_PRESERVED_TURNS = 2;
export const TAVERN_MANAGER_MIN_PRESERVED_TURNS = 1;

const managerQueues = new Map<string, Promise<unknown>>();
const activeAutoManagerRuns = new Map<string, {
    controller: AbortController;
    sessionId: string;
    userOrder: number;
    assistantOrder: number;
}>();
const MAX_MANAGER_TOOL_ROUNDS = 8;

function normalizeText(value: unknown = '', limit = 4000): string {
    const text = String(value || '').trim();
    return text.length > limit ? text.slice(0, limit) : text;
}

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value || '');
    }
}

function safeJsonParse(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    try {
        const parsed = JSON.parse(String(value || '{}'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : fallback;
    } catch {
        return fallback;
    }
}

function buildManagerSystemPrompt(assistantPreset: TavernAssistantPreset | undefined): string {
    return buildTavernManagerSystemPrompt(assistantPreset).trim();
}

function selectActiveEpisodeBlock(memoryFiles: Array<{ path: string; status: string; updatedAt: number; content: string }>): string {
    const activeEpisode = memoryFiles
        .filter((file) => file.status !== 'stale' && file.path.startsWith('memory/episodes/'))
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    if (!activeEpisode) {return '';}
    return ['[active_episode]', activeEpisode.path, activeEpisode.content].join('\n');
}

function buildResidentMemoryBlock(memoryFiles: Array<{ path: string; status: string; updatedAt: number; content: string }>): string {
    const sessionFile = memoryFiles.find((file) => file.path === 'memory/session.md');
    const stateFile = memoryFiles.find((file) => file.path === 'memory/state.md');
    const inboxFile = memoryFiles.find((file) => file.path === 'memory/inbox.md');
    const blocks = [
        sessionFile ? ['[memory/session.md]', sessionFile.content].join('\n') : '',
        stateFile ? ['[memory/state.md]', stateFile.content].join('\n') : '',
        selectActiveEpisodeBlock(memoryFiles),
        inboxFile ? ['[memory/inbox.md]', inboxFile.content].join('\n') : '',
    ].filter(Boolean);
    return ['[常驻记忆档案]', ...blocks].join('\n\n');
}

function buildAutoManagerUserPrompt(input: {
    turn: number;
    userMessage: TavernMessageRecord;
    assistantMessage: TavernMessageRecord;
    memoryFiles: Array<{ path: string; status: string; updatedAt: number; content: string }>;
}): string {
    return [
        buildResidentMemoryBlock(input.memoryFiles),
        '',
        '[本轮 RP 原文]',
        `turn: ${input.turn}`,
        `userOrder: ${input.userMessage.order}`,
        `assistantOrder: ${input.assistantMessage.order}`,
        '',
        '[用户消息]',
        input.userMessage.content,
        '',
        '[角色回复]',
        input.assistantMessage.content,
        '',
        '[本轮要求]',
        '1. 先按需读取相关记忆文件，再维护本轮记忆。',
        '2. 必须写或改 turns 文件；必要时同步更新 session/state/episode/inbox。',
        '3. 最终只用自然语言简短交代结果。',
    ].join('\n');
}

function buildChatManagerUserPrompt(input: {
    question: string;
    memoryFiles: Array<{ path: string; status: string; updatedAt: number; content: string }>;
}): string {
    return [
        buildResidentMemoryBlock(input.memoryFiles),
        '',
        '[当前问题]',
        input.question,
    ].join('\n');
}

function buildInputSummary(input: { trigger?: string; turn?: number; userOrder?: number; assistantOrder?: number; text?: string }): string {
    if (String(input.trigger || '') === 'manager_chat') {
        return `manager chat; turn ${Math.max(0, Number(input.turn) || 0)}; question ${String(input.text || '').length} chars`;
    }
    return `turn ${Math.max(0, Number(input.turn) || 0)}; messages ${Number(input.userOrder)}/${Number(input.assistantOrder)}; user ${String(input.text || '').length} chars`;
}

function changedTurnFiles(paths: string[] = []): string[] {
    return (Array.isArray(paths) ? paths : []).filter((path) => /^memory\/turns\/.+\.md$/i.test(String(path || '')));
}

async function runManagerOnce(options: XbTavernManagerOnceOptions): Promise<XbTavernManagerOnceResult> {
    const providerConfig = resolveActiveProviderConfig(options.agentConfig || {}, {
        role: 'delegate',
        timeoutMs: 15 * 60 * 1000,
    });
    const adapter = createAgentAdapter(providerConfig, {
        missingApiKeyMessage: '请先在 API 配置里填写记忆管理员 API。',
    });
    const result = await adapter.chat({
        systemPrompt: options.messages[0]?.content || '',
        messages: options.messages.slice(1),
        tools: Array.isArray(options.tools) ? options.tools : [],
        toolChoice: options.toolChoice || (options.tools?.length ? 'auto' : 'none'),
        temperature: providerConfig.temperature,
        maxTokens: providerConfig.maxTokens,
        signal: options.signal,
        onStreamProgress: (snapshot: { text?: string }) => {
            if (typeof snapshot.text === 'string') {
                options.onStreamProgress?.(snapshot.text);
            }
        },
    });
    return {
        text: String(result?.text || '').trim(),
        provider: String(result?.provider || providerConfig.provider || ''),
        model: String(result?.model || providerConfig.model || ''),
        toolCalls: Array.isArray(result?.toolCalls) ? result.toolCalls : [],
        providerPayload: result?.providerPayload,
    };
}

function summarizeToolArguments(args: Record<string, unknown> = {}): string {
    return ['filePath', 'path', 'pattern', 'mode', 'startOrder', 'endOrder']
        .map((key) => {
            const value = normalizeText(args[key], 160);
            return value ? `${key}: ${value}` : '';
        })
        .filter(Boolean)
        .join('; ');
}

function summarizeToolResult(result: TavernMemoryToolResult): string {
    return normalizeText(result.summary || result.error || '', 240);
}

function hasFailedMemoryTool(toolTrace: Array<Record<string, unknown>> = []): boolean {
    return toolTrace.some((item) => item.ok === false);
}

function isManagerAbortLike(error: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) {return true;}
    const message = error instanceof Error ? error.message : String(error || '');
    const name = error instanceof Error ? error.name : '';
    return name === 'AbortError' || /abort|aborted|cancelled|canceled/i.test(message);
}

function managerFailureStatus(error: unknown, signal?: AbortSignal): TavernManagerRunRecord['status'] {
    const message = error instanceof Error ? error.message : String(error || '');
    if (isManagerAbortLike(error, signal)) {return 'cancelled';}
    if (message === 'manager_source_messages_changed') {return 'superseded';}
    return 'failed';
}

async function rollbackManagerRunIfWroteMemory(managerRunId = ''): Promise<{
    managerRun: TavernManagerRunRecord | null;
    conflicts: string[];
} | null> {
    const snapshots = await listTavernManagerMemorySnapshots(managerRunId);
    if (!snapshots.some((snapshot) => String(snapshot.afterHash || '').trim())) {
        return null;
    }
    const result = await rollbackManagerRunMemoryWrites(managerRunId);
    return {
        managerRun: await updateTavernManagerRun(managerRunId, {}),
        conflicts: result.conflicts,
    };
}

function throwIfManagerAborted(signal?: AbortSignal) {
    if (!signal?.aborted) {return;}
    const error = new Error('manager_aborted');
    error.name = 'AbortError';
    throw error;
}

async function runManagerAgentWithTools(input: {
    sessionId: string;
    agentConfig: Record<string, unknown>;
    caller: 'auto' | 'chat';
    messages: XbTavernMessage[];
    managerRunId?: string;
    beforeWriteGuard?: () => Promise<void> | void;
    signal?: AbortSignal;
    executeManagerOnce?: (options: XbTavernManagerOnceOptions) => Promise<XbTavernManagerOnceResult>;
    onStreamProgress?: (text: string) => void;
}): Promise<{
    text: string;
    provider: string;
    model: string;
    toolTrace: Array<Record<string, unknown>>;
    changedFiles: string[];
}> {
    const executeManagerOnce = input.executeManagerOnce || runManagerOnce;
    const providerConfig = resolveActiveProviderConfig(input.agentConfig || {}, {
        role: 'delegate',
        timeoutMs: 15 * 60 * 1000,
    });
    const tools = getTavernManagerToolDefinitions();
    const toolTrace: Array<Record<string, unknown>> = [];
    const changedFiles = new Set<string>();
    let finalText = '';
    let resultProvider = '';
    let resultModel = '';
    let reminded = false;

    for (let round = 1; round <= MAX_MANAGER_TOOL_ROUNDS; round += 1) {
        throwIfManagerAborted(input.signal);
        const result = await executeManagerOnce({
            agentConfig: input.agentConfig,
            messages: input.messages,
            tools,
            toolChoice: 'auto',
            signal: input.signal,
            onStreamProgress: input.onStreamProgress,
        });
        throwIfManagerAborted(input.signal);
        finalText = String(result.text || '').trim();
        resultProvider = String(result.provider || resultProvider || providerConfig.provider || '');
        resultModel = String(result.model || resultModel || providerConfig.model || '');
        const resultRecord = result as unknown as Record<string, unknown>;
        const toolCalls = resolveResultToolCalls(resultRecord, providerConfig, {
            fallbackPrefix: 'tavern-manager-tool',
        });
        if (!toolCalls.length) {
            if (!hasVisibleText(finalText) && toolTrace.length && !reminded) {
                reminded = true;
                input.messages.push({
                    role: 'system',
                    content: '你已经拿到了工具结果。现在不要继续调用工具，直接简短说明本轮处理结论。',
                });
                continue;
            }
            return {
                text: finalText,
                provider: resultProvider,
                model: resultModel,
                toolTrace,
                changedFiles: [...changedFiles],
            };
        }

        input.messages.push(buildProviderAssistantToolCallMessage(resultRecord, toolCalls, {
            fallbackPrefix: 'tavern-manager-tool',
        }) as unknown as XbTavernMessage);

        for (const toolCall of toolCalls) {
            const args = safeJsonParse(toolCall.arguments, {});
            throwIfManagerAborted(input.signal);
            const toolResult = await executeTavernMemoryTool(input.sessionId, toolCall.name, args, {
                caller: input.caller,
                managerRunId: input.managerRunId,
                beforeWriteGuard: input.beforeWriteGuard,
            });
            if (toolResult.changed && toolResult.path) {
                changedFiles.add(toolResult.path);
            }
            toolTrace.push({
                round,
                name: toolCall.name,
                ok: toolResult.ok,
                args: summarizeToolArguments(args),
                path: toolResult.path || '',
                summary: summarizeToolResult(toolResult),
                error: toolResult.error || '',
            });
            input.messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: safeJson(toolResult),
            } as XbTavernMessage);
        }
    }

    throw new Error('manager_tool_round_limit');
}

async function assertManagerSourceMessagesCurrent(input: XbTavernManagerRunInput): Promise<void> {
    const messages = await listTavernMessages(input.sessionId);
    const userMessage = messages.find((message) => message.order === input.userMessage.order);
    const assistantMessage = messages.find((message) => message.order === input.assistantMessage.order);
    const userMatches = userMessage?.role === 'user'
        && userMessage.error !== true
        && userMessage.content === input.userMessage.content;
    const assistantMatches = assistantMessage?.role === 'assistant'
        && assistantMessage.error !== true
        && !['aborted', 'error'].includes(String(assistantMessage.finishReason || '').trim())
        && assistantMessage.content === input.assistantMessage.content;
    if (!userMatches || !assistantMatches) {
        throw new Error('manager_source_messages_changed');
    }
}

async function createOrUpdateManagerRun(input: {
    managerRunId?: string;
    sessionId: string;
    trigger: string;
    turn: number;
    userOrder?: number;
    assistantOrder?: number;
    inputSummary: string;
    agentConfig: Record<string, unknown>;
}): Promise<TavernManagerRunRecord> {
    const providerConfig = resolveActiveProviderConfig(input.agentConfig || {}, {
        role: 'delegate',
        timeoutMs: 15 * 60 * 1000,
    });
    const providerLabel = getXbTavernProviderLabel(String(providerConfig.provider || ''));
    const patch = {
        status: 'running' as const,
        provider: providerLabel,
        model: String(providerConfig.model || ''),
        inputSummary: input.inputSummary,
    };
    const record = input.managerRunId
        ? await updateTavernManagerRun(input.managerRunId, patch)
        : await createTavernManagerRun({
            sessionId: input.sessionId,
            trigger: input.trigger,
            turn: input.turn,
            userOrder: Number.isInteger(Number(input.userOrder)) ? Number(input.userOrder) : -1,
            assistantOrder: Number.isInteger(Number(input.assistantOrder)) ? Number(input.assistantOrder) : -1,
            ...patch,
        });
    if (!record) {
        throw new Error('manager_run_missing');
    }
    return record;
}

async function finalizeManagerRun(record: TavernManagerRunRecord, patch: Partial<TavernManagerRunRecord>): Promise<TavernManagerRunRecord> {
    return await updateTavernManagerRun(record.id, patch) || record;
}

async function buildAutoManagerMessages(input: XbTavernManagerRunInput): Promise<XbTavernMessage[]> {
    await ensureTavernMemoryDefaults(input.sessionId);
    const memoryFiles = await listTavernMemoryFiles(input.sessionId, { includeStale: true });
    return [
        { role: 'system', content: buildManagerSystemPrompt(input.assistantPreset) },
        {
            role: 'user',
            content: buildAutoManagerUserPrompt({
                turn: input.turn,
                userMessage: input.userMessage,
                assistantMessage: input.assistantMessage,
                memoryFiles,
            }),
        },
    ];
}

async function buildChatManagerMessages(input: {
    sessionId: string;
    question: string;
    assistantPreset?: TavernAssistantPreset;
    history?: TavernManagerMessageRecord[];
}): Promise<XbTavernMessage[]> {
    await ensureTavernMemoryDefaults(input.sessionId);
    const memoryFiles = await listTavernMemoryFiles(input.sessionId, { includeStale: true });
    const history = Array.isArray(input.history) ? input.history : await listTavernManagerMessages(input.sessionId);
    const messages: XbTavernMessage[] = [{ role: 'system', content: buildManagerSystemPrompt(input.assistantPreset) }];
    history.forEach((message) => {
        messages.push({
            role: message.role,
            content: String(message.content || ''),
        });
    });
    messages.push({
        role: 'user',
        content: buildChatManagerUserPrompt({
            question: input.question,
            memoryFiles,
        }),
    });
    return messages;
}

async function runManagerTask(input: {
    sessionId: string;
    agentConfig: Record<string, unknown>;
    trigger: string;
    turn: number;
    messages: XbTavernMessage[];
    managerRunId?: string;
    inputSummary: string;
    caller: 'auto' | 'chat';
    requireChangedFiles: boolean;
    beforeWriteGuard?: () => Promise<void> | void;
    signal?: AbortSignal;
    executeManagerOnce?: (options: XbTavernManagerOnceOptions) => Promise<XbTavernManagerOnceResult>;
    onStreamProgress?: (text: string) => void;
    userOrder?: number;
    assistantOrder?: number;
}): Promise<{
    ok: boolean;
    managerRun: TavernManagerRunRecord;
    text: string;
    provider: string;
    model: string;
    toolTrace: Array<Record<string, unknown>>;
    changedFiles: string[];
    error?: string;
}> {
    const managerRun = await createOrUpdateManagerRun({
        managerRunId: input.managerRunId,
        sessionId: input.sessionId,
        trigger: input.trigger,
        turn: input.turn,
        userOrder: input.userOrder,
        assistantOrder: input.assistantOrder,
        inputSummary: input.inputSummary,
        agentConfig: input.agentConfig,
    });

    let resultText = '';
    let resultProvider = managerRun.provider || '';
    let resultModel = managerRun.model || '';
    let toolTrace: Array<Record<string, unknown>> = [];
    let changedFiles: string[] = [];
    try {
        const result = await runManagerAgentWithTools({
            sessionId: input.sessionId,
            agentConfig: input.agentConfig,
            caller: input.caller,
            messages: input.messages,
            managerRunId: managerRun.id,
            beforeWriteGuard: input.beforeWriteGuard,
            signal: input.signal,
            executeManagerOnce: input.executeManagerOnce,
            onStreamProgress: input.onStreamProgress,
        });
        resultText = result.text;
        resultProvider = result.provider || resultProvider;
        resultModel = result.model || resultModel;
        toolTrace = result.toolTrace;
        changedFiles = result.changedFiles;
        if (hasFailedMemoryTool(toolTrace)) {
            throw new Error('manager_memory_tool_failed');
        }
        if (input.requireChangedFiles && !changedFiles.length) {
            throw new Error('manager_memory_tool_required');
        }
        await rebuildTavernMemoryDerivedIndex(input.sessionId);
        const completed = await finalizeManagerRun(managerRun, {
            status: 'completed',
            provider: resultProvider,
            model: resultModel,
            outputText: resultText || (changedFiles.length ? `已维护 ${changedFiles.length} 个记忆文件。` : '已检查并回复。'),
            parsedAction: changedFiles.length ? 'memory_files_updated' : 'memory_checked',
            toolTrace,
            changedFiles,
            error: '',
        });
        return {
            ok: true,
            managerRun: completed,
            text: resultText,
            provider: resultProvider,
            model: resultModel,
            toolTrace,
            changedFiles,
        };
    } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error || 'manager_failed');
        const status = managerFailureStatus(error, input.signal);
        const failed = await finalizeManagerRun(managerRun, {
            status,
            provider: resultProvider,
            model: resultModel,
            outputText: resultText,
            toolTrace,
            changedFiles,
            error: errorText,
        });
        const rolledBack = ['cancelled', 'superseded'].includes(status)
            ? await rollbackManagerRunIfWroteMemory(managerRun.id)
            : null;
        if (!rolledBack?.conflicts.length) {
            await rebuildTavernMemoryDerivedIndex(input.sessionId);
        }
        return {
            ok: false,
            managerRun: rolledBack?.managerRun || failed,
            text: resultText,
            provider: resultProvider,
            model: resultModel,
            toolTrace,
            changedFiles,
            error: errorText,
        };
    }
}

export function splitTavernManagerMessagesIntoTurns(messages: TavernManagerMessageRecord[] = []): TavernManagerMessageRecord[][] {
    const turns: TavernManagerMessageRecord[][] = [];
    let currentTurn: TavernManagerMessageRecord[] = [];
    (messages || []).forEach((message) => {
        if (!message || !['user', 'assistant'].includes(message.role)) {return;}
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

function throwIfAborted(signal?: AbortSignal) {
    if (!signal?.aborted) {return;}
    const error = new Error('manager_chat_compaction_aborted');
    error.name = 'AbortError';
    throw error;
}

async function estimateManagerChatTokens(input: {
    sessionId: string;
    agentConfig: Record<string, unknown>;
    assistantPreset?: TavernAssistantPreset;
    question: string;
    history?: TavernManagerMessageRecord[];
}): Promise<number> {
    const providerConfig = resolveActiveProviderConfig(input.agentConfig || {}, {
        role: 'delegate',
        timeoutMs: 15 * 60 * 1000,
    });
    const messages = await buildChatManagerMessages(input);
    return await resolveConversationTokens({
        messages,
        tools: getTavernManagerToolDefinitions(),
        providerConfig,
    });
}

export async function ensureTavernManagerChatBudget(input: EnsureTavernManagerChatBudgetInput): Promise<{
    compacted: boolean;
    currentTokens: number;
    preservedTurns?: number;
}> {
    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) {
        return { compacted: false, currentTokens: 0 };
    }
    throwIfAborted(input.signal);
    let history = await listTavernManagerMessages(sessionId);
    let currentTokens = await estimateManagerChatTokens({
        sessionId,
        agentConfig: input.agentConfig,
        assistantPreset: input.assistantPreset,
        question: input.question,
        history,
    });
    if (currentTokens <= TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS) {
        return { compacted: false, currentTokens };
    }
    input.onCompactionStart?.({
        currentTokens,
        triggerTokens: TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS,
        status: '正在释放较早管理员对话，只保留最近管理上下文...',
    });

    for (const preservedTurns of [TAVERN_MANAGER_DEFAULT_PRESERVED_TURNS, TAVERN_MANAGER_MIN_PRESERVED_TURNS]) {
        throwIfAborted(input.signal);
        const turns = splitTavernManagerMessagesIntoTurns(history);
        const archiveCount = Math.max(0, turns.length - Math.min(preservedTurns, turns.length));
        if (archiveCount > 0) {
            input.onCompactionProgress?.({
                currentTokens,
                triggerTokens: TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS,
                preservedTurns,
                status: `正在只保留最近 ${preservedTurns} 轮管理员上下文...`,
            });
            const removedOrders = turns
                .slice(0, archiveCount)
                .flat()
                .map((message) => message.order);
            if (removedOrders.length) {
                await deleteTavernManagerMessages(sessionId, removedOrders);
            }
            history = await listTavernManagerMessages(sessionId);
        }
        const nextTokens = await estimateManagerChatTokens({
            sessionId,
            agentConfig: input.agentConfig,
            assistantPreset: input.assistantPreset,
            question: input.question,
            history,
        });
        currentTokens = nextTokens;
        const status = nextTokens <= TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS
            ? `已只保留最近 ${preservedTurns} 轮管理员上下文。`
            : '最近管理员上下文仍然过长，继续收缩...';
        input.onCompactionProgress?.({
            currentTokens,
            yieldTokens: nextTokens,
            triggerTokens: TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS,
            preservedTurns,
            status,
        });
        if (nextTokens <= TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS) {
            input.onCompactionComplete?.({
                currentTokens,
                yieldTokens: nextTokens,
                triggerTokens: TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS,
                preservedTurns,
                status,
            });
            return { compacted: true, currentTokens: nextTokens, preservedTurns };
        }
    }

    input.onCompactionUnable?.({
        currentTokens,
        triggerTokens: TAVERN_MANAGER_SUMMARY_TRIGGER_TOKENS,
        status: '当前管理员这一轮上下文本身已经过长，无法继续自动收缩。',
    });
    return { compacted: false, currentTokens };
}

export async function runXbTavernManagerAfterTurn(input: XbTavernManagerRunInput): Promise<XbTavernManagerRunResult> {
    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) {throw new Error('manager_session_required');}
    const inputSummary = buildInputSummary({
        trigger: input.trigger || 'after_turn',
        turn: input.turn,
        userOrder: input.userMessage.order,
        assistantOrder: input.assistantMessage.order,
        text: input.userMessage.content,
    });
    const managerRun = input.managerRunId
        ? await updateTavernManagerRun(input.managerRunId, {
            status: 'running',
            inputSummary,
        })
        : await createTavernManagerRun({
            sessionId,
            trigger: input.trigger || 'after_turn',
            turn: input.turn,
            userOrder: input.userMessage.order,
            assistantOrder: input.assistantMessage.order,
            status: 'queued',
            inputSummary,
        });
    if (!managerRun) {
        throw new Error('manager_run_missing');
    }
    try {
        await assertManagerSourceMessagesCurrent(input);
        const messages = await buildAutoManagerMessages(input);
        const result = await runManagerTask({
            sessionId,
            agentConfig: input.agentConfig,
            trigger: input.trigger || 'after_turn',
            turn: input.turn,
            userOrder: input.userMessage.order,
            assistantOrder: input.assistantMessage.order,
            inputSummary,
            messages,
            managerRunId: managerRun.id,
            caller: 'auto',
            requireChangedFiles: true,
            beforeWriteGuard: async () => {
                throwIfManagerAborted(input.signal);
                await assertManagerSourceMessagesCurrent(input);
            },
            signal: input.signal,
            executeManagerOnce: input.executeManagerOnce,
        });
        if (!result.ok) {
            return {
                ok: false,
                managerRun: result.managerRun,
                error: result.error,
            };
        }
        await assertManagerSourceMessagesCurrent(input);
        const refreshedTurns = await listTavernTurnSummaries(sessionId);
        const turnSummary = refreshedTurns.find((summary) => (
            summary.userOrder === input.userMessage.order
            && summary.assistantOrder === input.assistantMessage.order
        ));
        if (!turnSummary) {
            const error = changedTurnFiles(result.changedFiles || []).length
                ? 'manager_turn_memory_invalid'
                : 'manager_turn_memory_required';
            const failed = await finalizeManagerRun(result.managerRun, {
                status: 'failed',
                error,
                changedFiles: result.changedFiles,
            });
            return {
                ok: false,
                managerRun: failed,
                error,
            };
        }
        const refreshedEpisodes = await listTavernEpisodeSummaries(sessionId);
        const episodeSummary = refreshedEpisodes[refreshedEpisodes.length - 1];
        return {
            ok: true,
            managerRun: result.managerRun,
            turnSummary,
            episodeSummary,
            changedFiles: result.changedFiles,
        };
    } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error || 'manager_failed');
        const status = managerFailureStatus(error, input.signal);
        const failed = await finalizeManagerRun(managerRun, {
            status,
            error: errorText,
        });
        const rolledBack = ['cancelled', 'superseded'].includes(status)
            ? await rollbackManagerRunIfWroteMemory(managerRun.id)
            : null;
        if (!rolledBack?.conflicts.length) {
            await rebuildTavernMemoryDerivedIndex(sessionId);
        }
        return {
            ok: false,
            managerRun: rolledBack?.managerRun || failed,
            error: errorText,
        };
    }
}

export async function runXbTavernManagerChat(input: XbTavernManagerChatInput): Promise<XbTavernManagerChatResult> {
    const sessionId = String(input.sessionId || '').trim();
    const question = String(input.question || '').trim();
    if (!sessionId) {throw new Error('manager_session_required');}
    if (!question) {throw new Error('manager_question_required');}
    const history = Array.isArray(input.history) ? input.history : await listTavernManagerMessages(sessionId);
    const messages = await buildChatManagerMessages({
        sessionId,
        question,
        assistantPreset: input.assistantPreset,
        history,
    });
    const result = await runManagerTask({
        sessionId,
        agentConfig: input.agentConfig,
        trigger: input.trigger || 'manager_chat',
        turn: Math.max(0, Number(input.turn) || 0),
        inputSummary: buildInputSummary({
            trigger: 'manager_chat',
            turn: input.turn,
            text: question,
        }),
        messages,
        caller: 'chat',
        requireChangedFiles: false,
        signal: input.signal,
        executeManagerOnce: input.executeManagerOnce,
        onStreamProgress: input.onStreamProgress,
    });
    return {
        ok: result.ok,
        managerRun: result.managerRun,
        text: result.text,
        provider: result.provider,
        model: result.model,
        changedFiles: result.changedFiles,
        error: result.error,
    };
}

export async function scheduleXbTavernManagerAfterTurn(input: XbTavernManagerRunInput & {
    awaitCompletion?: boolean;
    onManagerRunSaved?: (run: TavernManagerRunRecord) => void | Promise<void>;
}): Promise<XbTavernManagerScheduleResult> {
    const queued = await createTavernManagerRun({
        sessionId: input.sessionId,
        turn: input.turn,
        userOrder: input.userMessage.order,
        assistantOrder: input.assistantMessage.order,
        trigger: input.trigger || 'after_turn',
        status: 'queued',
        inputSummary: buildInputSummary({
            trigger: input.trigger || 'after_turn',
            turn: input.turn,
            userOrder: input.userMessage.order,
            assistantOrder: input.assistantMessage.order,
            text: input.userMessage.content,
        }),
    });
    await input.onManagerRunSaved?.(queued);
    const controller = new AbortController();
    const abortFromInput = () => controller.abort();
    if (input.signal?.aborted) {
        controller.abort();
    } else {
        input.signal?.addEventListener('abort', abortFromInput, { once: true });
    }
    activeAutoManagerRuns.set(queued.id, {
        controller,
        sessionId: input.sessionId,
        userOrder: input.userMessage.order,
        assistantOrder: input.assistantMessage.order,
    });
    const previous = managerQueues.get(input.sessionId) || Promise.resolve();
    const completion = previous
        .catch(() => {})
        .then(async () => {
            throwIfManagerAborted(controller.signal);
            const result = await runXbTavernManagerAfterTurn({
                ...input,
                managerRunId: queued.id,
                signal: controller.signal,
            });
            await input.onManagerRunSaved?.(result.managerRun);
            return result;
        })
        .catch(async (error) => {
            const errorText = error instanceof Error ? error.message : String(error || 'manager_failed');
            const failed = await updateTavernManagerRun(queued.id, {
                status: managerFailureStatus(error, input.signal),
                error: errorText,
            }) || queued;
            await input.onManagerRunSaved?.(failed);
            return {
                ok: false,
                managerRun: failed,
                error: errorText,
            };
        });
    managerQueues.set(input.sessionId, completion);
    completion.finally(() => {
        input.signal?.removeEventListener('abort', abortFromInput);
        activeAutoManagerRuns.delete(queued.id);
        if (managerQueues.get(input.sessionId) === completion) {
            managerQueues.delete(input.sessionId);
        }
    });
    const completedResult = input.awaitCompletion ? await completion : null;
    return {
        managerRunId: queued.id,
        managerStatus: completedResult?.managerRun?.status || queued.status,
        completion,
    };
}

export async function cancelAndRollbackXbTavernManagersForMessageRange(sessionId = '', fromOrder = 0): Promise<{
    runIds: string[];
    rolledBack: number;
    conflicts: string[];
    skipped: number;
}> {
    const id = String(sessionId || '').trim();
    const order = Number(fromOrder);
    if (!id || !Number.isFinite(order)) {
        return { runIds: [], rolledBack: 0, conflicts: [], skipped: 0 };
    }
    activeAutoManagerRuns.forEach((run) => {
        if (run.sessionId !== id) {return;}
        if (run.userOrder >= order || run.assistantOrder >= order) {
            run.controller.abort();
        }
    });
    return await rollbackManagerRunsForMessageRange(id, order);
}
