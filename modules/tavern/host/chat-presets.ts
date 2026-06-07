import { saveSettingsDebounced } from '../../../../../../../script.js';
import { getPresetManager } from '../../../../../../preset-manager.js';
import { promptManager } from '../../../../../../openai.js';

type XbTavernRole = 'system' | 'user' | 'assistant' | 'tool';
type TavernChatPromptPlacement =
    | 'top'
    | 'beforeCharacter'
    | 'afterCharacter'
    | 'beforeHistory'
    | 'afterHistory'
    | 'assistantPrefill';

interface TavernChatPromptSection {
    id?: string;
    label?: string;
    enabled?: boolean;
    marker?: boolean;
    role?: XbTavernRole | string;
    content?: string;
    placement?: TavernChatPromptPlacement;
    source?: string;
}

interface TavernChatPromptPresetBundle {
    id?: string;
    name?: string;
    source?: string;
    selected?: boolean;
    promptManager?: {
        name?: string;
        prompts?: unknown[];
        promptOrder?: unknown;
        rawPreset?: Record<string, unknown>;
        activeCharacterId?: string | number;
        activeOrder?: unknown[];
    };
    systemPrompt?: { name?: string; enabled?: boolean; content?: string; postHistory?: string };
    contextTemplate?: { name?: string; storyString?: string; chatStart?: string; exampleSeparator?: string };
    instructTemplate?: Record<string, unknown>;
    sections?: TavernChatPromptSection[];
    updatedAt?: number;
}

function createFallbackTavernChatPromptPresetBundle(): TavernChatPromptPresetBundle {
    return {
        id: 'sillytavern-current-chat-prompt',
        name: '酒馆当前聊天预设',
        source: 'sillytavern',
        selected: true,
        sections: [],
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray<T = unknown>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
}

function cloneJson<T>(value: T): T {
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        return value;
    }
}

function normalizeText(value: unknown = ''): string {
    return String(value || '').trim();
}

function normalizeTavernChatPromptPresetBundle(input: TavernChatPromptPresetBundle = {}): TavernChatPromptPresetBundle {
    const fallback = createFallbackTavernChatPromptPresetBundle();
    return {
        id: normalizeText(input.id) || fallback.id,
        name: normalizeText(input.name) || fallback.name,
        source: normalizeText(input.source) || 'sillytavern',
        selected: input.selected !== false,
        promptManager: input.promptManager,
        systemPrompt: input.systemPrompt,
        contextTemplate: input.contextTemplate,
        instructTemplate: input.instructTemplate,
        sections: Array.isArray(input.sections)
            ? input.sections.filter((section) => normalizeText(section.content) || section.marker === true)
            : [],
        updatedAt: Number(input.updatedAt) || undefined,
    };
}

function normalizePromptRole(value: unknown): XbTavernRole {
    const role = normalizeText(value).toLowerCase();
    return role === 'user' || role === 'assistant' ? role : 'system';
}

function resolvePromptPlacement(prompt: Record<string, unknown>): TavernChatPromptSection['placement'] {
    const identifier = normalizeText(prompt.identifier || prompt.id).toLowerCase();
    if (identifier === 'jailbreak') {return 'afterHistory';}
    const injectionPosition = Number(prompt.injection_position);
    if (Number.isFinite(injectionPosition) && injectionPosition > 0) {return 'afterHistory';}
    const position = normalizeText(prompt.position).toLowerCase();
    if (position.includes('after')) {return 'afterHistory';}
    if (position.includes('depth') || Number.isFinite(Number(prompt.injection_depth))) {return 'beforeHistory';}
    return 'beforeHistory';
}

function getPreparedPromptManagerPrompts(): unknown[] {
    const collection = promptManager?.getPromptCollection?.('normal');
    const prompts = asArray(asRecord(collection).collection);
    return prompts.length ? prompts : asArray(asRecord(promptManager?.serviceSettings).prompts);
}

function buildPromptManagerSections(prompts: unknown[] = []): TavernChatPromptSection[] {
    const sections: TavernChatPromptSection[] = [];
    prompts.forEach((item, index) => {
        const prompt = asRecord(item);
        const content = normalizeText(prompt.content);
        const marker = prompt.marker === true;
        if ((!content && !marker) || prompt.enabled === false || prompt.disabled === true) {return;}
        const identifier = normalizeText(prompt.identifier || prompt.id || `prompt-${index + 1}`);
        sections.push({
            id: `prompt-manager:${identifier}`,
            label: normalizeText(prompt.name || prompt.label || identifier),
            enabled: true,
            marker,
            role: normalizePromptRole(prompt.role),
            content,
            placement: resolvePromptPlacement(prompt),
            source: 'promptManager',
        });
    });
    return sections;
}

function getSelectedPromptManagerPreset(): Record<string, unknown> {
    const manager = getPresetManager('openai');
    const promptPresetName = normalizeText(manager?.getSelectedPresetName?.());
    const preset = asRecord(manager?.getCompletionPresetByName?.(promptPresetName));
    return Object.keys(preset).length ? cloneJson(preset) : cloneJson(asRecord(promptManager?.serviceSettings));
}

function getActivePromptManagerCharacterId(): string {
    const runtime = promptManager as typeof promptManager & { activeCharacter?: Record<string, unknown> };
    return normalizeText(asRecord(runtime?.activeCharacter).id);
}

function replaceActivePromptOrder(
    existingPromptOrder: unknown,
    activeCharacterId: string,
    nextOrder: unknown[] = [],
): unknown[] {
    const containers = asArray<Record<string, unknown>>(existingPromptOrder)
        .map((container) => ({ ...asRecord(container) }));
    const targetIndex = containers.findIndex((container) => normalizeText(container.character_id) === activeCharacterId);
    const target = targetIndex >= 0
        ? containers[targetIndex]
        : { character_id: activeCharacterId };
    const replacement = {
        ...target,
        character_id: target?.character_id ?? activeCharacterId,
        order: cloneJson(nextOrder),
    };
    if (targetIndex >= 0) {
        containers[targetIndex] = replacement;
    } else {
        containers.push(replacement);
    }
    return containers;
}

function pickPromptManagerRuntimeFields(source: Record<string, unknown> = {}): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (Array.isArray(source.prompts)) {
        result.prompts = cloneJson(source.prompts);
    }
    if (Array.isArray(source.prompt_order)) {
        result.prompt_order = cloneJson(source.prompt_order);
    }
    return result;
}

function setPromptManagerSelectedPresetName(name = ''): void {
    const manager = getPresetManager('openai') as {
        findPreset?: (presetName: string) => unknown;
        select?: { val?: (value: unknown) => unknown };
    } | null;
    const presetName = normalizeText(name);
    if (!manager || !presetName) {return;}
    const value = manager.findPreset?.(presetName);
    if (value === undefined || value === null) {return;}
    try {
        manager.select?.val?.(value);
    } catch {}
}

function buildCurrentBundle(): TavernChatPromptPresetBundle {
    const promptSettings = asRecord(promptManager?.serviceSettings);
    const promptPresetName = normalizeText(getPresetManager('openai')?.getSelectedPresetName?.());
    const rawPreset = getSelectedPromptManagerPreset();
    const promptManagerRuntime = promptManager as typeof promptManager & {
        activeCharacter?: Record<string, unknown>;
        getPromptOrderForCharacter?: (character: unknown) => unknown[];
    };
    const activeCharacter = asRecord(promptManagerRuntime?.activeCharacter);
    const activeCharacterId = activeCharacter.id as string | number | undefined;
    const activeOrder = Array.isArray(promptManagerRuntime?.getPromptOrderForCharacter?.(promptManagerRuntime.activeCharacter))
        ? promptManagerRuntime.getPromptOrderForCharacter(promptManagerRuntime.activeCharacter)
        : [];
    const sections: TavernChatPromptSection[] = [
        ...buildPromptManagerSections(getPreparedPromptManagerPrompts()),
    ];
    return normalizeTavernChatPromptPresetBundle({
        id: promptPresetName || createFallbackTavernChatPromptPresetBundle().id,
        name: promptPresetName || createFallbackTavernChatPromptPresetBundle().name,
        source: 'sillytavern',
        selected: true,
        promptManager: {
            name: promptPresetName,
            prompts: cloneJson(asArray(rawPreset.prompts).length ? asArray(rawPreset.prompts) : asArray(promptSettings.prompts)),
            promptOrder: cloneJson('prompt_order' in rawPreset ? rawPreset.prompt_order : promptSettings.prompt_order),
            rawPreset,
            activeCharacterId,
            activeOrder: cloneJson(activeOrder),
        },
        sections,
        updatedAt: Date.now(),
    });
}

function getComponentNames(): Record<string, string[]> {
    return {
        promptManager: getPresetManager('openai')?.getAllPresets?.() || [],
    };
}

export function listTavernChatPresetBundles(): Record<string, unknown> {
    const active = buildCurrentBundle();
    return {
        active,
        bundles: [active],
        components: getComponentNames(),
    };
}

export function getTavernChatPresetBundle(): TavernChatPromptPresetBundle {
    return buildCurrentBundle();
}

async function savePromptManagerPreset(bundle: TavernChatPromptPresetBundle): Promise<void> {
    const manager = getPresetManager('openai');
    const name = normalizeText(bundle.promptManager?.name);
    if (!manager || !name) {return;}
    const selectedName = normalizeText(manager.getSelectedPresetName?.());
    if (selectedName && selectedName !== name) {
        throw new Error('酒馆当前预设已切换，请刷新后再保存。');
    }
    const existing = cloneJson(manager.getCompletionPresetByName?.(name) || {});
    if (!Object.keys(asRecord(existing)).length) {
        throw new Error(`聊天预设不存在：${name}`);
    }
    const currentActiveCharacterId = getActivePromptManagerCharacterId();
    const submittedActiveCharacterId = normalizeText(bundle.promptManager?.activeCharacterId);
    if (!currentActiveCharacterId || !submittedActiveCharacterId || currentActiveCharacterId !== submittedActiveCharacterId) {
        throw new Error('未取得当前角色顺序，请刷新后再保存。');
    }
    const patch: Record<string, unknown> = { ...asRecord(existing) };
    if (Array.isArray(bundle.promptManager?.prompts)) {
        patch.prompts = cloneJson(bundle.promptManager.prompts);
    }
    if (Array.isArray(bundle.promptManager?.activeOrder)) {
        patch.prompt_order = replaceActivePromptOrder(
            asRecord(existing).prompt_order,
            currentActiveCharacterId,
            bundle.promptManager.activeOrder,
        );
    }
    await manager.savePreset?.(name, patch);
    if (promptManager?.serviceSettings) {
        Object.assign(promptManager.serviceSettings, pickPromptManagerRuntimeFields(patch));
    }
    setPromptManagerSelectedPresetName(name);
    promptManager?.saveServiceSettings?.();
    promptManager?.render?.(false);
}

function applyPromptManagerPromptFieldsFromPreset(name = ''): boolean {
    const manager = getPresetManager('openai');
    const presetName = normalizeText(name);
    if (!manager || !presetName) {return false;}
    const preset = asRecord(manager.getCompletionPresetByName?.(presetName));
    if (!Object.keys(preset).length) {return false;}
    if (promptManager?.serviceSettings) {
        const promptFields = pickPromptManagerRuntimeFields(preset);
        if (!Object.keys(promptFields).length) {return false;}
        Object.assign(promptManager.serviceSettings, promptFields);
    }
    setPromptManagerSelectedPresetName(presetName);
    promptManager?.saveServiceSettings?.();
    promptManager?.render?.(false);
    return true;
}

export async function saveTavernChatPresetBundle(input: unknown): Promise<TavernChatPromptPresetBundle> {
    const bundle = normalizeTavernChatPromptPresetBundle(asRecord(input));
    await savePromptManagerPreset(bundle);
    saveSettingsDebounced?.();
    return buildCurrentBundle();
}

export async function selectTavernChatPresetBundle(input: unknown): Promise<TavernChatPromptPresetBundle> {
    const source = asRecord(input);
    const promptManagerName = normalizeText(source.promptManagerName || source.name);
    if (promptManagerName) {
        applyPromptManagerPromptFieldsFromPreset(promptManagerName);
    }
    saveSettingsDebounced?.();
    return buildCurrentBundle();
}
