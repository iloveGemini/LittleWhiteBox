import {
    chat_metadata,
    eventSource,
    name2,
    setCharacterId,
    setCharacterName,
    this_chid,
} from '../../../../../../../script.js';
import { getContext } from '../../../../../../extensions.js';
import { power_user } from '../../../../../../power-user.js';
import {
    checkWorldInfo,
    getWorldInfoSettings,
    loadWorldInfo,
    METADATA_KEY,
    openWorldInfoEditor,
    selected_world_info,
    updateWorldInfoList,
    world_names,
} from '../../../../../../world-info.js';
import type {
    XbTavernContext,
    XbTavernHistoryMessage,
    XbTavernNativeWorldInfoRuntime,
    XbTavernNativeWorldInfoSource,
    XbTavernNativeWorldInfoTimedEffect,
    XbTavernNativeWorldInfoTimedState,
    XbTavernWorldEntry,
} from '../shared/message-assembler.js';

type TavernWorldbookSourceType = 'chat' | 'persona' | 'character' | 'global' | 'embedded' | string;

interface TavernWorldbookSourceRow {
    name: string;
    globalActive: boolean;
}

interface TavernWorldbookSourceListResult {
    books: TavernWorldbookSourceRow[];
}

interface TavernWorldbookPreviewEntry {
    uid: string;
    name: string;
    keys: string[];
    secondaryKeys: string[];
    contentPreview: string;
    enabled: boolean;
    constant: boolean;
    order: number;
}

interface TavernWorldbookPreviewResult {
    name: string;
    entryCount: number;
    enabledCount: number;
    constantCount: number;
    disabledCount: number;
    keywordCount: number;
    totalChars: number;
    entries: TavernWorldbookPreviewEntry[];
}

interface TavernWorldbookRuntimeInput {
    context?: XbTavernContext;
    currentUserMessage?: string;
    trigger?: string;
    timedState?: XbTavernNativeWorldInfoTimedState;
    maxContext?: number;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeText(value: unknown = ''): string {
    return String(value || '').trim();
}

function normalizeStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeText(item)).filter(Boolean);
    }
    const text = normalizeText(value);
    return text ? [text] : [];
}

function cloneJson<T>(value: T): T {
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        return value;
    }
}

function readWorldbookEntries(data: unknown): Record<string, unknown>[] {
    const entries = asRecord(data).entries;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {return [];}
    return Object.values(entries as Record<string, unknown>)
        .map((entry) => asRecord(entry))
        .filter((entry) => Object.keys(entry).length > 0);
}

function previewEntryName(entry: Record<string, unknown>, index: number): string {
    return normalizeText(entry.comment)
        || normalizeText(entry.name)
        || normalizeText(entry.title)
        || `条目 ${index + 1}`;
}

function readHistoryMessages(context: XbTavernContext = {}): XbTavernHistoryMessage[] {
    return Array.isArray(context.history) ? context.history : [];
}

function ensureTimedBucket(value: unknown): Record<string, XbTavernNativeWorldInfoTimedEffect> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {return {};}
    const result: Record<string, XbTavernNativeWorldInfoTimedEffect> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        if (!key || !item || typeof item !== 'object' || Array.isArray(item)) {return;}
        const source = item as Record<string, unknown>;
        const normalized: XbTavernNativeWorldInfoTimedEffect = {};
        const hash = Number(source.hash);
        const start = Number(source.start);
        const end = Number(source.end);
        if (Number.isFinite(hash)) {normalized.hash = hash;}
        if (Number.isFinite(start)) {normalized.start = start;}
        if (Number.isFinite(end)) {normalized.end = end;}
        if (source.protected === true) {normalized.protected = true;}
        if (Object.keys(normalized).length) {
            result[key] = normalized;
        }
    });
    return result;
}

function normalizeTimedState(value: unknown): XbTavernNativeWorldInfoTimedState {
    const source = asRecord(value);
    return {
        sticky: ensureTimedBucket(source.sticky),
        cooldown: ensureTimedBucket(source.cooldown),
    };
}

function valuesToRecordList(value: unknown): Record<string, unknown>[] {
    if (!value || typeof value !== 'object') {return [];}
    const maybeValues = (value as { values?: () => Iterable<unknown> }).values;
    if (typeof maybeValues !== 'function') {return [];}
    return Array.from(maybeValues.call(value))
        .map((entry) => asRecord(entry))
        .filter((entry) => Object.keys(entry).length > 0);
}

function replaceSelectedWorldInfo(names: string[] = []): void {
    if (!Array.isArray(selected_world_info)) {return;}
    selected_world_info.splice(0, selected_world_info.length, ...names);
}

function collectGlobalWorldbookNames(context: XbTavernContext = {}): string[] {
    const sessionMeta = asRecord(context.sessionMeta);
    const worldbookSources = Array.isArray(sessionMeta.worldbookSources) ? sessionMeta.worldbookSources : [];
    return worldbookSources
        .filter((source) => normalizeText(asRecord(source).sourceType) === 'global')
        .map((source) => normalizeText(asRecord(source).name))
        .filter(Boolean);
}

function dedupeSources(sources: XbTavernNativeWorldInfoSource[] = []): XbTavernNativeWorldInfoSource[] {
    const seen = new Set<string>();
    const result: XbTavernNativeWorldInfoSource[] = [];
    sources.forEach((source, index) => {
        const name = normalizeText(source.name);
        if (!name || seen.has(name)) {return;}
        seen.add(name);
        result.push({
            name,
            ...(source.sourceType ? { sourceType: source.sourceType } : {}),
            ...(Number.isFinite(Number(source.sourceIndex)) ? { sourceIndex: Number(source.sourceIndex) } : { sourceIndex: index }),
        });
    });
    return result;
}

function collectRuntimeSources(context: XbTavernContext = {}): XbTavernNativeWorldInfoSource[] {
    const sessionMeta = asRecord(context.sessionMeta);
    const metaSources = Array.isArray(sessionMeta.worldbookSources)
        ? sessionMeta.worldbookSources.map((source, index) => {
            const record = asRecord(source);
            return {
                name: normalizeText(record.name),
                sourceType: normalizeText(record.sourceType) as TavernWorldbookSourceType,
                sourceIndex: Number.isFinite(Number(record.sourceIndex)) ? Number(record.sourceIndex) : index,
            } as XbTavernNativeWorldInfoSource;
        })
        : [];
    const legacyMetaSources = !metaSources.length && Array.isArray(sessionMeta.worldbookNames)
        ? sessionMeta.worldbookNames.map((name, index) => ({
            name: normalizeText(name),
            sourceType: 'global',
            sourceIndex: index,
        } as XbTavernNativeWorldInfoSource))
        : [];
    const bookSources = Array.isArray(context.worldBooks)
        ? context.worldBooks.map((book, index) => ({
            name: normalizeText(book.name),
            sourceType: normalizeText(book.worldSourceType) as TavernWorldbookSourceType,
            sourceIndex: Number.isFinite(Number(book.worldSourceIndex)) ? Number(book.worldSourceIndex) : index,
        }))
        : [];
    return dedupeSources([...metaSources, ...legacyMetaSources, ...bookSources]);
}

function buildHistoryScanLines(context: XbTavernContext = {}, currentUserMessage = '', includeNames = false): string[] {
    const userName = normalizeText(context.user?.name) || 'User';
    const characterName = normalizeText(context.character?.name) || 'Assistant';
    const lines = readHistoryMessages(context)
        .filter((message) => ['user', 'assistant'].includes(normalizeText(message.role)))
        .map((message) => {
            const role = normalizeText(message.role) === 'user' || message.is_user === true ? 'user' : 'assistant';
            const content = normalizeText(message.content || message.mes || message.message);
            if (!content) {return '';}
            if (!includeNames) {return content;}
            const speaker = role === 'user'
                ? (normalizeText(message.name) || userName)
                : (normalizeText(message.name) || characterName);
            return `${speaker}: ${content}`;
        })
        .filter(Boolean);
    const current = normalizeText(currentUserMessage);
    if (current) {
        lines.push(includeNames ? `${userName}: ${current}` : current);
    }
    return lines.reverse();
}

function buildGlobalScanData(input: TavernWorldbookRuntimeInput = {}): Record<string, unknown> {
    const context = input.context || {};
    const character = context.character || {};
    const user = context.user || {};
    const data = asRecord(character.data);
    const extensions = asRecord(data.extensions);
    return {
        personaDescription: normalizeText(user.persona || user.description),
        characterDescription: normalizeText(character.description || data.description),
        characterPersonality: normalizeText(character.personality || data.personality),
        characterDepthPrompt: normalizeText(asRecord(extensions.depth_prompt).prompt),
        scenario: normalizeText(character.scenario || data.scenario),
        creatorNotes: normalizeText(character.creatorNotes || character.creator_notes || data.creator_notes),
        trigger: normalizeText(input.trigger || context.worldSettings?.trigger) || 'normal',
    };
}

function describeActivationReason(entry: Record<string, unknown>): string {
    if (entry.constant === true) {return 'constant';}
    return 'native';
}

function normalizePromptEntryRole(value: unknown): number {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {return numeric;}
    return 0;
}

function buildActivatedPromptEntries(
    entries: Record<string, unknown>[],
    sources: XbTavernNativeWorldInfoSource[],
): XbTavernWorldEntry[] {
    const sourceByName = new Map(sources.map((source) => [normalizeText(source.name), source]));
    return entries.map((entry, index) => {
        const sourceWorldBook = normalizeText(entry.world || entry.sourceWorldBook);
        const source = sourceByName.get(sourceWorldBook);
        const uid = entry.uid ?? entry.id ?? index;
        return {
            uid,
            id: uid,
            key: normalizeStringList(entry.key),
            keysecondary: normalizeStringList(entry.keysecondary),
            secondary_keys: normalizeStringList(entry.secondary_keys),
            comment: normalizeText(entry.comment),
            title: normalizeText(entry.title),
            name: normalizeText(entry.name),
            content: normalizeText(entry.content),
            order: Number(entry.order ?? 100),
            position: Number(entry.position ?? 0),
            role: normalizePromptEntryRole(entry.role),
            depth: Number.isFinite(Number(entry.depth)) ? Number(entry.depth) : 0,
            constant: entry.constant === true,
            disable: entry.disable === true,
            enabled: entry.disable !== true,
            vectorized: entry.vectorized === true,
            decorators: Array.isArray(entry.decorators) ? cloneJson(entry.decorators) : [],
            selective: entry.selective === true,
            selectiveLogic: Number.isFinite(Number(entry.selectiveLogic)) ? Number(entry.selectiveLogic) : 0,
            scanDepth: Number.isFinite(Number(entry.scanDepth)) ? Number(entry.scanDepth) : null,
            caseSensitive: entry.caseSensitive === true,
            matchWholeWords: entry.matchWholeWords === true,
            ignoreBudget: entry.ignoreBudget === true,
            excludeRecursion: entry.excludeRecursion === true,
            preventRecursion: entry.preventRecursion === true,
            delayUntilRecursion: entry.delayUntilRecursion as boolean | number,
            characterFilter: cloneJson(entry.characterFilter),
            group: normalizeText(entry.group),
            groupOverride: entry.groupOverride === true,
            groupWeight: Number.isFinite(Number(entry.groupWeight)) ? Number(entry.groupWeight) : undefined,
            useGroupScoring: typeof entry.useGroupScoring === 'boolean' ? entry.useGroupScoring : null,
            matchPersonaDescription: entry.matchPersonaDescription === true,
            matchCharacterDescription: entry.matchCharacterDescription === true,
            matchCharacterPersonality: entry.matchCharacterPersonality === true,
            matchCharacterDepthPrompt: entry.matchCharacterDepthPrompt === true,
            matchScenario: entry.matchScenario === true,
            matchCreatorNotes: entry.matchCreatorNotes === true,
            probability: Number.isFinite(Number(entry.probability)) ? Number(entry.probability) : undefined,
            useProbability: entry.useProbability !== false,
            sticky: entry.sticky as boolean | number,
            cooldown: Number.isFinite(Number(entry.cooldown)) ? Number(entry.cooldown) : undefined,
            delay: Number.isFinite(Number(entry.delay)) ? Number(entry.delay) : undefined,
            triggers: normalizeStringList(entry.triggers),
            outletName: normalizeText(entry.outletName),
            sourceWorldBook,
            worldSourceType: source?.sourceType,
            worldSourceIndex: source?.sourceIndex,
            extensions: {
                nativeActivationReason: describeActivationReason(entry),
            },
            activationReason: describeActivationReason(entry),
        } as XbTavernWorldEntry;
    }).filter((entry) => !!normalizeText(entry.content));
}

function captureRuntimeState(): {
    selectedWorldInfo: string[];
    chatLore: string;
    personaLore: string;
    characterId: string;
    characterName: string;
    timedState: XbTavernNativeWorldInfoTimedState;
    authorNote: unknown;
    emit: unknown;
} {
    const context = asRecord(getContext?.() || {});
    const extensionPrompts = asRecord(context.extensionPrompts);
    return {
        selectedWorldInfo: Array.isArray(selected_world_info) ? [...selected_world_info] : [],
        chatLore: normalizeText(chat_metadata?.[METADATA_KEY]),
        personaLore: normalizeText(power_user?.persona_description_lorebook),
        characterId: normalizeText(this_chid),
        characterName: normalizeText(name2),
        timedState: normalizeTimedState(chat_metadata?.timedWorldInfo),
        authorNote: cloneJson(extensionPrompts.note),
        emit: eventSource?.emit,
    };
}

function applyRuntimeState(input: {
    context: XbTavernContext;
    sources: XbTavernNativeWorldInfoSource[];
    timedState: XbTavernNativeWorldInfoTimedState;
}): void {
    const globalNames = input.sources
        .filter((source) => source.sourceType === 'global')
        .map((source) => normalizeText(source.name))
        .filter(Boolean);
    replaceSelectedWorldInfo(globalNames);
    const chatLore = input.sources.find((source) => source.sourceType === 'chat')?.name || '';
    const personaLore = input.sources.find((source) => source.sourceType === 'persona')?.name || '';
    if (chatLore) {
        chat_metadata[METADATA_KEY] = chatLore;
    } else {
        delete chat_metadata[METADATA_KEY];
    }
    power_user.persona_description_lorebook = personaLore || '';
    setCharacterId(normalizeText(input.context.character?.id) || undefined);
    if (normalizeText(input.context.character?.name)) {
        setCharacterName(normalizeText(input.context.character?.name));
    }
    chat_metadata.timedWorldInfo = cloneJson(normalizeTimedState(input.timedState));
    if (eventSource && typeof eventSource.emit === 'function') {
        eventSource.emit = async () => undefined;
    }
}

function restoreRuntimeState(snapshot: ReturnType<typeof captureRuntimeState>): void {
    replaceSelectedWorldInfo(snapshot.selectedWorldInfo);
    if (snapshot.chatLore) {
        chat_metadata[METADATA_KEY] = snapshot.chatLore;
    } else {
        delete chat_metadata[METADATA_KEY];
    }
    power_user.persona_description_lorebook = snapshot.personaLore || '';
    setCharacterId(snapshot.characterId || undefined);
    setCharacterName(snapshot.characterName || '');
    chat_metadata.timedWorldInfo = cloneJson(snapshot.timedState);
    const context = asRecord(getContext?.() || {});
    const extensionPrompts = asRecord(context.extensionPrompts);
    if (snapshot.authorNote !== undefined) {
        extensionPrompts.note = cloneJson(snapshot.authorNote);
    }
    if (eventSource) {
        eventSource.emit = snapshot.emit as typeof eventSource.emit;
    }
}

async function ensureWorldbookNames(): Promise<string[]> {
    if (!Array.isArray(world_names) || !world_names.length) {
        await updateWorldInfoList();
    }
    return Array.isArray(world_names) ? [...world_names] : [];
}

export async function listTavernWorldbookSources(input: unknown = {}): Promise<TavernWorldbookSourceListResult> {
    const payload = asRecord(input);
    const context = asRecord(payload.context);
    const requestedContext = (Object.keys(context).length ? context : undefined) as XbTavernContext | undefined;
    const names = await ensureWorldbookNames();
    const sourceContext = requestedContext || {};
    const globalNameSet = new Set(collectGlobalWorldbookNames(sourceContext));
    return {
        books: names.map((name) => ({
            name,
            globalActive: globalNameSet.has(name),
        })),
    };
}

export async function getTavernWorldbookPreview(input: unknown = {}): Promise<TavernWorldbookPreviewResult> {
    const payload = asRecord(input);
    const name = normalizeText(payload.name);
    if (!name) {
        throw new Error('缺少世界书名称。');
    }
    const names = await ensureWorldbookNames();
    if (!names.includes(name)) {
        throw new Error(`找不到世界书：${name}`);
    }
    const data = await loadWorldInfo(name);
    const entries = readWorldbookEntries(data);
    const limit = Math.max(1, Math.floor(Number(payload.limit) || 24));
    const previewEntries = entries
        .map((entry, index) => {
            const keys = normalizeStringList(entry.key);
            const secondaryKeys = normalizeStringList(entry.keysecondary || entry.secondary_keys);
            const content = normalizeText(entry.content);
            return {
                uid: normalizeText(entry.uid ?? entry.id ?? index),
                name: previewEntryName(entry, index),
                keys,
                secondaryKeys,
                contentPreview: content,
                enabled: entry.disable !== true,
                constant: entry.constant === true,
                order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 100,
            };
        })
        .sort((a, b) => Number(b.order) - Number(a.order))
        .slice(0, limit);
    return {
        name,
        entryCount: entries.length,
        enabledCount: entries.filter((entry) => entry.disable !== true).length,
        constantCount: entries.filter((entry) => entry.constant === true).length,
        disabledCount: entries.filter((entry) => entry.disable === true).length,
        keywordCount: entries.reduce((sum, entry) => (
            sum
            + normalizeStringList(entry.key).length
            + normalizeStringList(entry.keysecondary || entry.secondary_keys).length
        ), 0),
        totalChars: entries.reduce((sum, entry) => sum + normalizeText(entry.content).length, 0),
        entries: previewEntries,
    };
}

export async function getTavernWorldbookRuntime(input: unknown = {}): Promise<XbTavernNativeWorldInfoRuntime> {
    const payload = asRecord(input) as TavernWorldbookRuntimeInput;
    const context = payload.context || {};
    const includeNames = context.worldSettings?.includeNames === true || getWorldInfoSettings().world_info_include_names === true;
    const chatLines = buildHistoryScanLines(context, payload.currentUserMessage, includeNames);
    const globalScanData = buildGlobalScanData(payload);
    const maxContext = Math.max(1, Number(payload.maxContext) || Number(asRecord(getContext?.() || {}).maxContext) || 4096);
    const sources = collectRuntimeSources(context);
    const snapshot = captureRuntimeState();
    applyRuntimeState({
        context,
        sources,
        timedState: normalizeTimedState(payload.timedState),
    });
    try {
        const activated = await checkWorldInfo(chatLines, maxContext, false, globalScanData);
        const activatedPromptEntries = buildActivatedPromptEntries(
            valuesToRecordList(activated.allActivatedEntries),
            sources,
        );
        return {
            trigger: normalizeText(globalScanData.trigger),
            sourceNames: sources,
            activatedEntries: activatedPromptEntries,
            worldInfoBefore: normalizeText(activated.worldInfoBefore),
            worldInfoAfter: normalizeText(activated.worldInfoAfter),
            worldInfoExamples: Array.isArray(activated.EMEntries)
                ? activated.EMEntries.map((entry: unknown) => ({
                    position: normalizeText(asRecord(entry).position),
                    content: normalizeText(asRecord(entry).content),
                })).filter((entry: { position?: string; content?: string }) => entry.content)
                : [],
            worldInfoDepth: Array.isArray(activated.WIDepthEntries)
                ? activated.WIDepthEntries.map((entry: unknown) => ({
                    depth: Number(asRecord(entry).depth),
                    role: Number(asRecord(entry).role),
                    entries: normalizeStringList(asRecord(entry).entries),
                })).filter((entry: { depth?: number; role?: number; entries?: string[] }) => Array.isArray(entry.entries) && entry.entries.length)
                : [],
            anBefore: normalizeStringList(activated.ANBeforeEntries),
            anAfter: normalizeStringList(activated.ANAfterEntries),
            outlets: Object.fromEntries(
                Object.entries(asRecord(activated.outletEntries))
                    .map(([key, value]) => [key, normalizeStringList(value)])
                    .filter(([, value]) => value.length),
            ),
            timedState: normalizeTimedState(chat_metadata?.timedWorldInfo),
        };
    } finally {
        restoreRuntimeState(snapshot);
    }
}

export function openTavernWorldbookEditor(input: unknown = {}): Record<string, unknown> {
    const name = normalizeText(asRecord(input).name);
    if (!name) {
        throw new Error('缺少世界书名称。');
    }
    openWorldInfoEditor(name);
    return {
        ok: true,
        name,
    };
}
