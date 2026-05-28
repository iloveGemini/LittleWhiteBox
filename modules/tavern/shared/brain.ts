import {
    buildXbTavernMessages,
    createXbTavernBuildSnapshot,
    type XbTavernBuildSnapshot,
    type XbTavernContext,
    type XbTavernMessageBuildResult,
    type XbTavernPreset,
    type XbTavernRuntimeState,
    type XbTavernWorldEntryState,
    type XbTavernWorldSettings,
} from './message-assembler';

export const DEFAULT_XB_TAVERN_WORLD_SETTINGS = Object.freeze({
    recursion: true,
    recursionLimit: 4,
    budgetChars: 24000,
});

export interface XbTavernBrainBuildInput {
    context: XbTavernContext;
    preset: XbTavernPreset;
    currentUserMessage: string;
    historyMode?: XbTavernRuntimeState['historyMode'];
    turn?: number;
    entryStates?: Record<string, XbTavernWorldEntryState>;
    diagnostics?: unknown;
}

export interface XbTavernBrainBuildResult {
    runtimeState: XbTavernRuntimeState;
    buildResult: XbTavernMessageBuildResult;
    buildSnapshot: XbTavernBuildSnapshot;
    rawMessagesJson: string;
}

export function createXbTavernWorldSettings(input: {
    turn?: number;
    entryStates?: Record<string, XbTavernWorldEntryState>;
} = {}): XbTavernWorldSettings {
    return {
        ...DEFAULT_XB_TAVERN_WORLD_SETTINGS,
        turn: Math.max(0, Number(input.turn) || 0),
        entryStates: input.entryStates || {},
    };
}

export function createXbTavernRuntimeState(input: XbTavernBrainBuildInput): XbTavernRuntimeState {
    return {
        currentUserMessage: String(input.currentUserMessage || ''),
        historyMode: input.historyMode || 'squash',
        worldSettings: createXbTavernWorldSettings({
            turn: input.turn,
            entryStates: input.entryStates,
        }),
    };
}

export function buildXbTavernBrain(input: XbTavernBrainBuildInput): XbTavernBrainBuildResult {
    const context = input.context || {};
    const preset = input.preset || {};
    const runtimeState = createXbTavernRuntimeState(input);
    const buildResult = buildXbTavernMessages(context, preset, runtimeState);
    const buildSnapshot = createXbTavernBuildSnapshot(context, preset, buildResult, input.diagnostics);
    return {
        runtimeState,
        buildResult,
        buildSnapshot,
        rawMessagesJson: buildResult.meta.rawMessagesJson,
    };
}
