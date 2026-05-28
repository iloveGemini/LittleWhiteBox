import { createAgentAdapter, resolveActiveProviderConfig } from '../../../agent-core/provider-config.js';
import {
    type XbTavernBuildSnapshot,
    type XbTavernContext,
    type XbTavernMessage,
    type XbTavernMessageBuildResult,
    type XbTavernPreset,
    type XbTavernRuntimeState,
} from '../../shared/message-assembler';
import {
    appendTavernMessage,
    createTavernSession,
    getTavernSession,
    listTavernMessages,
    normalizeTavernSessionState,
    updateTavernSessionState,
    updateTavernSessionSnapshot,
    type TavernMessageRecord,
    type TavernSessionRecord,
    type TavernSessionState,
} from '../../shared/session-db';
import { buildXbTavernBrain } from '../../shared/brain';

export interface TavernRunOnceOptions {
    agentConfig: Record<string, unknown>;
    messages: XbTavernMessage[];
    signal?: AbortSignal;
    onStreamProgress?: (snapshot: { text?: string; thoughts?: Array<{ label?: string; text?: string }> }) => void;
}

export interface TavernRequestSnapshot {
    provider: string;
    model: string;
    messageCount: number;
    messageChars: number;
    rawMessagesJson: string;
}

export interface TavernRunOnceResult {
    text: string;
    thoughts?: Array<{ label?: string; text?: string }>;
    model?: string;
    provider?: string;
    finishReason?: string;
    providerPayload?: unknown;
    requestSnapshot: TavernRequestSnapshot;
}

export interface TavernDiagnostics {
    ok?: boolean;
    message?: string;
    worldbookErrors?: Array<{ name: string; error: string }>;
}

export interface XbTavernRunTurnInput {
    sessionId?: string;
    agentConfig: Record<string, unknown>;
    contextSnapshot: XbTavernContext;
    preset: XbTavernPreset;
    currentUserMessage: string;
    runtimeState?: TavernSessionState;
    diagnostics?: TavernDiagnostics;
    historyMode?: XbTavernRuntimeState['historyMode'];
    signal?: AbortSignal;
    onStreamProgress?: (snapshot: { text?: string; thoughts?: Array<{ label?: string; text?: string }> }) => void;
    executeRunOnce?: (options: TavernRunOnceOptions) => Promise<TavernRunOnceResult>;
}

export interface XbTavernRunResult {
    sessionId: string;
    userMessage: TavernMessageRecord;
    assistantMessage?: TavernMessageRecord;
    errorMessage?: TavernMessageRecord;
    buildResult: XbTavernMessageBuildResult;
    buildSnapshot: XbTavernBuildSnapshot;
    requestSnapshot: TavernRequestSnapshot;
    provider: string;
    model: string;
    finishReason?: string;
    previewMatchesRequest: boolean;
    nextTurn: number;
    error?: string;
}

function resolveProviderConfig(agentConfig: Record<string, unknown> = {}): Record<string, unknown> {
    return resolveActiveProviderConfig(agentConfig || {}, {
        timeoutMs: 15 * 60 * 1000,
    });
}

export function buildTavernRequestSnapshot(
    agentConfig: Record<string, unknown> = {},
    messages: XbTavernMessage[] = [],
    override: Partial<Pick<TavernRequestSnapshot, 'provider' | 'model'>> = {},
): TavernRequestSnapshot {
    const providerConfig = resolveProviderConfig(agentConfig);
    return {
        provider: String(override.provider || providerConfig.provider || ''),
        model: String(override.model || providerConfig.model || ''),
        messageCount: messages.length,
        messageChars: messages.reduce((sum, message) => sum + String(message.content || '').length, 0),
        rawMessagesJson: JSON.stringify(messages, null, 2),
    };
}

export function buildContextHistory(messages: TavernMessageRecord[] = []): XbTavernMessage[] {
    return messages
        .filter((message) => !message.error)
        .map((message) => ({
            role: ['system', 'user', 'assistant', 'tool'].includes(message.role)
                ? message.role as XbTavernMessage['role']
                : 'assistant',
            content: message.content,
            ...(message.name ? { name: message.name } : {}),
        }));
}

async function ensureRunSession(input: XbTavernRunTurnInput, buildSnapshot?: XbTavernBuildSnapshot): Promise<TavernSessionRecord> {
    const existing = await getTavernSession(input.sessionId || '');
    if (existing) {return existing;}
    const contextSnapshot = input.contextSnapshot || {};
    const character = contextSnapshot.character || {};
    return await createTavernSession({
        title: `${character.name || '未选择角色'} · 小白酒馆`,
        characterId: String(character.id || ''),
        characterName: String(character.name || '未选择角色'),
        contextSnapshot,
        buildSnapshot,
        presetId: String(input.preset.id || ''),
        presetName: String(input.preset.name || ''),
        state: {
            turn: 0,
            worldEntryStates: {},
        },
    });
}

export async function runTavernOnce(options: TavernRunOnceOptions): Promise<TavernRunOnceResult> {
    const providerConfig = resolveProviderConfig(options.agentConfig);
    const adapter = createAgentAdapter(providerConfig, {
        missingApiKeyMessage: '请先在小白助手模型配置里填写 API Key。',
    });
    const result = await adapter.chat({
        systemPrompt: '',
        messages: options.messages,
        tools: [],
        toolChoice: 'none',
        temperature: providerConfig.temperature,
        maxTokens: providerConfig.maxTokens,
        signal: options.signal,
        onStreamProgress: options.onStreamProgress,
    });
    const text = String(result?.text || '');
    const provider = String(result?.provider || providerConfig.provider || '');
    const model = String(result?.model || providerConfig.model || '');
    return {
        text,
        thoughts: result?.thoughts,
        model,
        provider,
        finishReason: result?.finishReason,
        providerPayload: result?.providerPayload,
        requestSnapshot: buildTavernRequestSnapshot(options.agentConfig, options.messages, {
            provider,
            model,
        }),
    };
}

export async function runXbTavernTurn(input: XbTavernRunTurnInput): Promise<XbTavernRunResult> {
    const baseSession = await ensureRunSession(input);
    const sessionMessages = await listTavernMessages(baseSession.id);
    const sessionState = normalizeTavernSessionState(baseSession.state || input.runtimeState || {});
    const lockedContext = baseSession.contextSnapshot || input.contextSnapshot || {};
    const contextForBuild: XbTavernContext = {
        ...lockedContext,
        history: buildContextHistory(sessionMessages),
    };
    const brain = buildXbTavernBrain({
        context: contextForBuild,
        preset: input.preset,
        currentUserMessage: input.currentUserMessage,
        historyMode: input.historyMode || 'squash',
        turn: sessionState.turn,
        entryStates: sessionState.worldEntryStates,
        diagnostics: input.diagnostics || {},
    });
    const { buildResult, buildSnapshot } = brain;
    const session = baseSession.buildSnapshot
        ? baseSession
        : await updateTavernSessionSnapshot(baseSession.id, {
            contextSnapshot: lockedContext,
            buildSnapshot,
            presetId: String(input.preset.id || baseSession.presetId || ''),
            presetName: String(input.preset.name || baseSession.presetName || ''),
        }) || baseSession;
    const requestSnapshot = buildTavernRequestSnapshot(input.agentConfig, buildResult.messages);
    const presetId = String(input.preset.id || session.presetId || '');
    const presetName = String(input.preset.name || session.presetName || '');
    const userMessage = await appendTavernMessage(session.id, {
        role: 'user',
        content: input.currentUserMessage,
        contextSnapshot: lockedContext,
        buildSnapshot,
        presetId,
        presetName,
        requestSnapshot,
    });

    try {
        const executeRunOnce = input.executeRunOnce || runTavernOnce;
        const result = await executeRunOnce({
            agentConfig: input.agentConfig,
            messages: buildResult.messages,
            signal: input.signal,
            onStreamProgress: input.onStreamProgress,
        });
        const assistantMessage = await appendTavernMessage(session.id, {
            role: 'assistant',
            content: result.text,
            providerPayload: result.providerPayload,
            contextSnapshot: lockedContext,
            buildSnapshot,
            presetId,
            presetName,
            requestSnapshot: result.requestSnapshot,
            provider: result.provider || '',
            model: result.model || '',
            finishReason: result.finishReason || '',
        });
        const nextTurn = Number(sessionState.turn || 0) + 1;
        await updateTavernSessionState(session.id, {
            turn: nextTurn,
            worldEntryStates: buildResult.meta.worldEntryStateUpdates,
            lastBuildSnapshot: buildSnapshot,
            lastRequestSnapshot: result.requestSnapshot,
            lastProvider: result.provider || '',
            lastModel: result.model || '',
        });
        return {
            sessionId: session.id,
            userMessage,
            assistantMessage,
            buildResult,
            buildSnapshot,
            requestSnapshot: result.requestSnapshot,
            provider: result.provider || '',
            model: result.model || '',
            finishReason: result.finishReason,
            previewMatchesRequest: buildResult.meta.rawMessagesJson === result.requestSnapshot.rawMessagesJson,
            nextTurn,
        };
    } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error || 'run_failed');
        const errorMessage = await appendTavernMessage(session.id, {
            role: 'assistant',
            content: errorText,
            error: true,
            contextSnapshot: lockedContext,
            buildSnapshot,
            presetId,
            presetName,
            requestSnapshot,
            provider: requestSnapshot.provider,
            model: requestSnapshot.model,
            finishReason: 'error',
        });
        await updateTavernSessionState(session.id, {
            lastBuildSnapshot: buildSnapshot,
            lastRequestSnapshot: requestSnapshot,
            lastProvider: requestSnapshot.provider,
            lastModel: requestSnapshot.model,
            lastError: errorText,
        });
        return {
            sessionId: session.id,
            userMessage,
            errorMessage,
            buildResult,
            buildSnapshot,
            requestSnapshot,
            provider: requestSnapshot.provider,
            model: requestSnapshot.model,
            finishReason: 'error',
            previewMatchesRequest: buildResult.meta.rawMessagesJson === requestSnapshot.rawMessagesJson,
            nextTurn: Number(sessionState.turn || 0),
            error: errorText,
        };
    }
}
