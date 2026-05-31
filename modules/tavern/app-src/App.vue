<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { enhanceMarkdownContent, renderMarkdownToHtml } from '../../agent-core/ui/message-markdown.js';
import { createAgentSettingsPanel } from '../../agent-core/ui/settings-panel.js';
import { buildAgentSettingsPanelMarkup } from '../../agent-core/ui/settings-markup.js';
import { normalizeAgentConfig } from '../../agent-core/config.js';
import { setHostChatCompletionsRequestHeadersProvider } from '../../../shared/host-llm/chat-completions/client.js';
import {
    type XbTavernContext,
    type XbTavernPresetSection,
} from '../shared/message-assembler';
import { buildXbTavernBrain } from '../shared/brain';
import {
    buildXbTavernMemoryIgnoredTerms,
    buildXbTavernMemoryQuery,
    selectXbTavernMemoryContext,
} from '../shared/memory-retrieval';
import { createDefaultXbTavernPreset, DEFAULT_XB_TAVERN_PRESET_ID } from '../shared/presets';
import {
    createTavernSession,
    deleteTavernMessages,
    deriveAndActivateDefaultTavernPreset,
    getActiveTavernPresetId,
    getSelectedTavernSessionId,
    listTavernEpisodeSummaries,
    listTavernManagerRuns,
    loadActiveTavernPreset,
    listTavernMessages,
    listTavernSessions,
    listTavernTurnSummaries,
    listUserTavernPresets,
    markTavernMemoryStaleFromOrder,
    normalizeTavernSessionState,
    replaceTavernSessionState,
    saveTavernPreset,
    setActiveTavernPresetId,
    setSelectedTavernSessionId,
    updateTavernMessage,
    updateTavernSessionSnapshot,
    type TavernEpisodeSummaryRecord,
    type TavernManagerRunRecord,
    type TavernMessageRecord,
    type TavernPresetRecord,
    type TavernSessionRecord,
    type TavernTurnSummaryRecord,
} from '../shared/session-db';
import { buildContextHistory, deriveTavernSessionStateFromMessages, runXbTavernTurn } from './runtime/run-once';
import { runXbTavernManagerAfterTurn } from './runtime/manager';
import { resolveXbTavernProviderConfig } from './runtime/provider';

interface TavernDiagnostics {
    ok?: boolean;
    message?: string;
    worldbookErrors?: Array<{ name: string; error: string }>;
}

interface RequestAuditSnapshot {
    rawMessagesJson?: string;
    messageCount?: number;
    messageChars?: number;
    presetName?: string;
    provider?: string;
    providerLabel?: string;
    model?: string;
    toolMode?: string;
}

const SOURCE_APP = 'xb-tavern-app';
const SOURCE_HOST = 'xb-tavern-host';
const HOST_REQUEST_TIMEOUT_MS = 5000;

const context = ref<XbTavernContext>({});
const diagnostics = ref<TavernDiagnostics>({});
const agentConfig = ref<Record<string, unknown>>({});
const hostRequestHeaders = ref<Record<string, unknown>>({});
const apiSettingsRootRef = ref<HTMLElement | null>(null);
const apiConfigSave = ref({ status: 'idle', requestId: '', error: '' });
const apiConfigStatus = ref('');
const availableCharacters = ref<Array<{ id: string; name: string; avatar?: string }>>([]);
const selectedCharacterId = ref('');
const statusText = ref('等待读取资料');
const currentUserMessage = ref('');
const historyMode = ref<'raw' | 'squash'>('squash');
const runtimeText = ref('');
const runtimeError = ref('');
const runtimeProvider = ref('');
const runtimeModel = ref('');
const runtimeSnapshotJson = ref('');
const isRunning = ref(false);
const sessions = ref<TavernSessionRecord[]>([]);
const selectedSessionId = ref('');
const sessionMessages = ref<TavernMessageRecord[]>([]);
const turnSummaries = ref<TavernTurnSummaryRecord[]>([]);
const episodeSummaries = ref<TavernEpisodeSummaryRecord[]>([]);
const managerRuns = ref<TavernManagerRunRecord[]>([]);
const managerActionStatus = ref('');
const preset = ref(createDefaultXbTavernPreset());
const userPresets = ref<TavernPresetRecord[]>([]);
const activePresetId = ref(DEFAULT_XB_TAVERN_PRESET_ID);
const presetStatus = ref('');
const savedPresetJson = ref('');
const selectedPresetSourceId = ref('');
type AppView = 'home' | 'chat' | 'inspect' | 'settings';
type WorkspaceKey = 'snapshot' | 'world' | 'messages' | 'runtime' | 'api' | 'preset';
type SettingsWorkspaceKey = 'api' | 'preset';
type ChatFocus = 'chat' | 'balanced' | 'manager';
interface BrainCheck {
    key: WorkspaceKey;
    label: string;
    ok: boolean;
    detail: string;
}
interface PendingHostRequest {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: number;
}
const presetIsBuiltIn = computed(() => activePresetId.value === DEFAULT_XB_TAVERN_PRESET_ID);
const pendingHostRequests = new Map<string, PendingHostRequest>();
const presetDirty = computed(() => !presetIsBuiltIn.value && snapshotPreset(preset.value) !== savedPresetJson.value);
const selectedSession = computed(() => sessions.value.find((item) => item.id === selectedSessionId.value) || null);
const sessionRuntimeState = computed(() => normalizeTavernSessionState(selectedSession.value?.state || {}));
const activeView = ref<AppView>('home');
const activeSettingsWorkspace = ref<SettingsWorkspaceKey>('api');
const chatFocus = ref<ChatFocus>('balanced');
const chatScrollRef = ref<HTMLElement | null>(null);
const chatAutoScroll = ref(true);
const showChatScrollTop = ref(false);
const showChatScrollBottom = ref(false);
const chatScrollControlsActive = ref(false);
const editingMessageKey = ref('');
const editingMessageDraft = ref('');
const messageActionFeedback = ref<Record<string, 'success' | 'error'>>({});
const activeRunController = ref<AbortController | null>(null);
const markdownHtmlCache = new Map<string, string>();
const apiSettingsPanelState: Record<string, unknown> = {
    config: {},
    configDraft: null,
    configFormSyncPending: true,
    configPage: 'main',
    configSave: apiConfigSave.value,
    pullStateByProvider: {},
    modelOptionsByProvider: {},
};
let apiSettingsPanel: ReturnType<typeof createAgentSettingsPanel> | null = null;
let chatScrollHideTimer: number | null = null;
let chatScrollTicking = false;
let chatTouchStartY: number | null = null;
let chatLastScrollTop = 0;
const usingLockedSessionContext = computed(() => !!selectedSession.value?.contextSnapshot);
const liveWorldBookCount = computed(() => context.value.worldBooks?.length || 0);
const liveWorldEntryCount = computed(() => (context.value.worldBooks || []).reduce((sum, book) => sum + (book.entries?.length || 0), 0));
const contextSourceTitle = computed(() => usingLockedSessionContext.value
    ? '当前显示和试聊：会话锁定资料'
    : '当前显示和试聊：刚读取的酒馆资料');
const contextSourceDetail = computed(() => usingLockedSessionContext.value
    ? `会话锁定了 ${selectedSession.value?.characterName || '未选择角色'} 的资料。你刚改角色卡或世界书后，需要刷新会话资料，或者改用刚读取资料重新试聊。`
    : `正在使用酒馆最新读取资料：${context.value.character?.name || '未选择角色'} / 世界书 ${liveWorldBookCount.value} 本 ${liveWorldEntryCount.value} 条。`);
const activeWorkspace = ref<WorkspaceKey>('snapshot');
const workspaceTabs = [
    { key: 'snapshot', label: '资料', hint: '角色卡和会话快照' },
    { key: 'world', label: '世界书', hint: '读到的资料和命中条目' },
    { key: 'messages', label: '发送内容', hint: '最终 messages' },
    { key: 'runtime', label: '运行记录', hint: '试跑和 payload' },
] as const;
const workspaceFallbackItems: Record<WorkspaceKey, { key: WorkspaceKey; label: string; hint: string }> = {
    snapshot: { key: 'snapshot', label: '资料', hint: '角色卡和会话快照' },
    world: { key: 'world', label: '世界书', hint: '读到的资料和命中条目' },
    messages: { key: 'messages', label: '发送内容', hint: '最终 messages' },
    runtime: { key: 'runtime', label: '运行记录', hint: '试跑和 payload' },
    api: { key: 'api', label: 'API 配置', hint: '使用小白助手和电纸书同一套模型预设' },
    preset: { key: 'preset', label: '小白预设', hint: '修改最终发送内容里使用的小白规则' },
};
const activeWorkspaceItem = computed(() => workspaceTabs.find((item) => item.key === activeWorkspace.value)
    || workspaceFallbackItems[activeWorkspace.value]);

const effectiveContext = computed<XbTavernContext>(() => ({
    ...(selectedSession.value?.contextSnapshot || context.value),
    history: selectedSessionId.value
        ? buildContextHistory(sessionMessages.value)
        : context.value.history,
}));
const memoryContext = computed(() => selectXbTavernMemoryContext({
    episodeSummaries: episodeSummaries.value,
    turnSummaries: turnSummaries.value,
    queryText: buildXbTavernMemoryQuery(effectiveContext.value, currentUserMessage.value),
    ignoredTerms: buildXbTavernMemoryIgnoredTerms(effectiveContext.value),
}));

const brainBuild = computed(() => buildXbTavernBrain({
    context: effectiveContext.value,
    preset: preset.value,
    currentUserMessage: currentUserMessage.value,
    historyMode: historyMode.value,
    turn: sessionRuntimeState.value.turn,
    entryStates: sessionRuntimeState.value.worldEntryStates,
    memoryContext: memoryContext.value,
    diagnostics: diagnostics.value,
}));
const buildResult = computed(() => brainBuild.value.buildResult);

const effectiveCharacter = computed(() => effectiveContext.value.character || {});
const effectiveUser = computed(() => effectiveContext.value.user || {});
const characterName = computed(() => effectiveCharacter.value.name || '未选择角色');
const userName = computed(() => effectiveUser.value.name || 'User');
const worldBooks = computed(() => effectiveContext.value.worldBooks || []);
const worldBookCount = computed(() => worldBooks.value.length);
const worldEntryCount = computed(() => buildResult.value.worldEntryCandidates.length);
const activatedCount = computed(() => buildResult.value.activatedWorldEntries.length);
const messagePreview = computed(() => buildResult.value.messages);
const selectedSessionTitle = computed(() => selectedSession.value?.title || '未创建会话');
const rawMessagesJson = computed(() => buildResult.value.meta.rawMessagesJson);
const buildSnapshot = computed(() => brainBuild.value.buildSnapshot);
const effectiveHistoryCount = computed(() => effectiveContext.value.history?.length || 0);
const lastRequestSnapshot = computed(() => selectedSession.value?.state?.lastRequestSnapshot as RequestAuditSnapshot | undefined);
const lastRequestMatchesPreview = computed(() => !!lastRequestSnapshot.value?.rawMessagesJson
    && lastRequestSnapshot.value.rawMessagesJson === rawMessagesJson.value);
const resolvedProviderConfig = computed(() => resolveXbTavernProviderConfig(agentConfig.value));
const apiReady = computed(() => resolvedProviderConfig.value.readiness.ok);
const apiReadyDetail = computed(() => resolvedProviderConfig.value.readiness.message);
const chatMessages = computed(() => sessionMessages.value);
const sessionMessagesForChat = computed(() => sessionMessages.value.filter((message) => !message.error));
const latestErrorMessage = computed(() => {
    if (runtimeError.value) {return runtimeError.value;}
    const lastMessage = [...sessionMessages.value].sort((left, right) => left.order - right.order).at(-1);
    return lastMessage?.error ? lastMessage.content : '';
});
const latestManagerRun = computed(() => managerRuns.value[0] || null);
const managerBusy = computed(() => managerRuns.value.some((run) => ['queued', 'running'].includes(run.status)));
const recentTurnSummaries = computed(() => [...turnSummaries.value].reverse().slice(0, 8));
const managerStatusLine = computed(() => {
    if (managerActionStatus.value) {return managerActionStatus.value;}
    const latest = latestManagerRun.value;
    if (!latest) {return '暂无工作记录';}
    if (latest.status === 'failed') {return `失败：${latest.error || 'manager_failed'}`;}
    if (latest.status === 'completed') {return `最近完成：第 ${latest.turn} 轮`; }
    if (latest.status === 'running') {return `正在整理：第 ${latest.turn} 轮`; }
    return `排队中：第 ${latest.turn} 轮`;
});
const chatMarkdownSignature = computed(() => sessionMessages.value
    .map((message) => `${message.sessionId}:${message.order}:${message.error ? 1 : 0}:${markdownSignature(message.content)}`)
    .join('|'));
const chatReadyLabel = computed(() => selectedSessionId.value ? selectedSessionTitle.value : '未创建会话');
const chatSubtitle = computed(() => {
    if (!selectedSessionId.value) {return '写一句话后会自动创建独立会话。';}
    const turn = Number(sessionRuntimeState.value.turn || 0);
    return `${characterName.value} · 第 ${turn} 轮 · ${sessionMessagesForChat.value.length} 条可用消息`;
});
const lastModelLine = computed(() => {
    const provider = String(lastRequestSnapshot.value?.providerLabel || lastRequestSnapshot.value?.provider || runtimeProvider.value || resolvedProviderConfig.value.providerLabel || '').trim();
    const model = String(lastRequestSnapshot.value?.model || runtimeModel.value || resolvedProviderConfig.value.model || '').trim();
    if (!provider && !model) {return '尚未发模';}
    return `${provider || '未知通道'} / ${model || '未知模型'}`;
});
const apiRuntimeLine = computed(() => {
    const config = resolvedProviderConfig.value;
    return `共享预设「${config.currentPresetName || '默认'}」 · ${config.providerLabel} / ${config.model || '未选择模型'} · ${config.toolMode}`;
});
const chatTriggerSummary = computed(() => {
    if (!currentUserMessage.value.trim()) {return '填写输入后，这里会预览世界书命中。';}
    if (!activatedCandidateRows.value.length) {return '这句暂时没有触发世界书。';}
    return `这句会带上 ${activatedCandidateRows.value.length} 条世界书。`;
});
const canSendMessage = computed(() => isRunning.value || !!currentUserMessage.value.trim());
const brainChecks = computed<BrainCheck[]>(() => {
    const layers = buildResult.value.messageLayers;
    const topRulesLocked = layers[0]?.layer === 'lwb-system'
        && layers[1]?.layer === 'lwb-tool'
        && messagePreview.value[0]?.role === 'system'
        && messagePreview.value[1]?.role === 'system';
    const worldExplainable = candidateRows.value.every((entry) => entry.status && entry.insertionTarget);
    const hasRequestAudit = !!lastRequestSnapshot.value?.rawMessagesJson;
    return [
        {
            key: 'snapshot',
            label: '资料快照',
            ok: !!effectiveContext.value.character?.name,
            detail: effectiveContext.value.character?.name
                ? `${effectiveContext.value.character.name} / 世界书 ${worldBookCount.value} 本 / 历史 ${effectiveHistoryCount.value} 条`
                : '还没有读到角色卡',
        },
        {
            key: 'messages',
            label: '顶层规则',
            ok: topRulesLocked,
            detail: topRulesLocked ? '小白 system 和工具边界固定在最前两条' : '最前两条规则异常',
        },
        {
            key: 'world',
            label: '世界书解释',
            ok: worldExplainable,
            detail: `候选 ${worldEntryCount.value} 条，激活 ${activatedCount.value} 条，跳过原因可检查`,
        },
        {
            key: 'messages',
            label: '发送内容',
            ok: lastRequestMatchesPreview.value,
            detail: hasRequestAudit
                ? (lastRequestMatchesPreview.value
                    ? `上次试跑和当前预览一致：${lastRequestSnapshot.value?.messageCount || messagePreview.value.length} 条`
                    : '当前预览已经不同于上次实际发送，需要重新试跑')
                : `待试跑：当前预览 ${messagePreview.value.length} 条 / ${buildSnapshot.value.messageChars} 字`,
        },
        {
            key: 'api',
            label: 'API 配置',
            ok: apiReady.value,
            detail: apiReady.value ? apiRuntimeLine.value : apiReadyDetail.value,
        },
        {
            key: 'runtime',
            label: '独立会话',
            ok: !!selectedSessionId.value,
            detail: selectedSessionId.value ? '试跑会写入小白酒馆会话' : '还没创建小白酒馆会话',
        },
    ];
});

const characterFields = computed(() => {
    const character = effectiveContext.value.character || {};
    const user = effectiveContext.value.user || {};
    return [
        ['角色', character.name],
        ['头像', character.avatar],
        ['用户', user.name],
        ['用户 persona', user.persona || user.description],
        ['描述', character.description],
        ['性格', character.personality],
        ['场景', character.scenario],
        ['首条消息', character.firstMessage || character.first_mes],
        ['示例消息', character.mesExample || character.mes_example],
        ['作者备注', character.creatorNotes || character.creator_notes],
    ].filter((item) => String(item[1] || '').trim());
});

const diagnosticRows = computed(() => {
    const rows = [
        contextSourceDetail.value,
        apiReady.value ? `API：${apiRuntimeLine.value}` : `API：${apiReadyDetail.value}`,
        diagnostics.value.message || statusText.value,
        characterName.value ? '' : '当前没有可用角色卡。',
        effectiveHistoryCount.value ? '' : '这次准备资料里没有聊天历史。',
        worldBookCount.value ? '' : '这次准备资料里没有可用世界书。',
        ...(diagnostics.value.worldbookErrors || []).map((item) => `${item.name}: ${item.error}`),
    ];
    return rows.map((item) => String(item || '').trim()).filter(Boolean);
});

const messageRows = computed(() => messagePreview.value.map((message, index) => {
    const layer = buildResult.value.messageLayers[index];
    return {
        index,
        message,
        layer: layer?.layer || 'unknown',
        label: layer?.label || 'unknown',
        sourceId: layer?.sourceId || '',
        chars: layer?.chars || message.content.length,
        tokenEstimate: layer?.tokenEstimate || Math.max(1, Math.ceil(message.content.length / 4)),
    };
}));

type MessagePreviewRow = (typeof messageRows.value)[number];

const messageGroups = computed(() => {
    const labels: Record<string, string> = {
        'lwb-system': '最高优先级规则',
        'lwb-tool': '工具和行为边界',
        top: '开场规则',
        preset: '补充规则',
        'world-before': '先放入的世界书',
        'character-card': '角色卡',
        'world-after': '角色卡后的世界书',
        'world-author-note': '世界书 · 作者备注',
        'world-examples': '世界书 · 示例消息',
        history: '会话历史',
        'current-user/history': '历史和本次输入',
        'current-user': '本次输入',
        'world-depth': '插入到历史里的世界书',
        'assistant-prefill': '回复开头',
    };
    const groups: Array<{ key: string; label: string; rows: MessagePreviewRow[]; chars: number; tokenEstimate: number }> = [];
    messageRows.value.forEach((row) => {
        const previous = groups[groups.length - 1];
        let group = previous?.key === row.layer ? previous : null;
        if (!group) {
            group = {
                key: row.layer,
                label: labels[row.layer] || row.label || row.layer,
                rows: [],
                chars: 0,
                tokenEstimate: 0,
            };
            groups.push(group);
        }
        group.rows.push(row);
        group.chars += row.chars;
        group.tokenEstimate += row.tokenEstimate;
    });
    return groups;
});

const activatedOrder = computed(() => new Map(buildResult.value.activatedWorldEntries.map((entry, index) => [entry.activationKey, index])));
const candidateRows = computed(() => buildResult.value.worldEntryCandidates);
function displayList(value: unknown): string {
    if (Array.isArray(value)) {return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ');}
    return String(value || '').trim();
}
const worldBookEntryRows = computed(() => worldBooks.value.flatMap((book) => (book.entries || []).map((entry, index) => ({
    key: `${book.name || 'worldbook'}-${entry.uid ?? entry.id ?? index}`,
    bookName: book.name || '未命名世界书',
    title: String(entry.comment || entry.title || entry.name || entry.uid || entry.id || `条目 ${index + 1}`),
    keywords: displayList(entry.key),
    secondaryKeywords: displayList(entry.keysecondary || entry.secondary_keys),
    content: String(entry.content || ''),
}))));
const scanTextPreview = computed(() => buildResult.value.meta.scanText || '');
const worldBudget = computed(() => buildResult.value.meta.worldBudget);
const worldPositionRows = computed(() => Object.entries(buildResult.value.meta.worldPositionCounts || {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hans-CN')));
const activatedCandidateRows = computed(() => candidateRows.value
    .filter((entry) => entry.status === 'activated')
    .sort((left, right) => (activatedOrder.value.get(left.activationKey) ?? 999999) - (activatedOrder.value.get(right.activationKey) ?? 999999)));
const skippedCandidateRows = computed(() => candidateRows.value
    .filter((entry) => entry.status !== 'activated')
    .sort((left, right) => right.order - left.order || left.activationKey.localeCompare(right.activationKey, 'zh-Hans-CN')));
const placementLabels: Record<string, string> = {
    top: '最前面',
    beforeCharacter: '角色卡前',
    afterCharacter: '角色卡后',
    beforeHistory: '历史前',
    afterHistory: '历史后',
    assistantPrefill: '回复开头',
};
const presetRows = computed(() => {
    const sections = Array.isArray(preset.value.sections) ? preset.value.sections : [];
    const rows: Array<XbTavernPresetSection & { previewId: string; previewLabel: string; previewPlacement: string }> = [
        {
            previewId: 'lwb-system',
            previewLabel: '最高优先级规则',
            previewPlacement: '固定在最前面',
            role: 'system',
            locked: true,
            enabled: true,
            content: preset.value.systemPrompt,
        },
        {
            previewId: 'lwb-tool',
            previewLabel: '工具和行为边界',
            previewPlacement: '固定在最前面',
            role: 'system',
            locked: true,
            enabled: true,
            content: preset.value.toolPrompt,
        },
        ...sections.map((section, index) => ({
            ...section,
            previewId: section.id || `preset-section-${index}`,
            previewLabel: section.label || section.id || `规则段 ${index + 1}`,
            previewPlacement: placementLabels[section.placement || 'beforeHistory'] || section.placement || '历史前',
            enabled: section.enabled !== false,
        })),
    ];
    return rows
        .map((row) => ({
            ...row,
            content: String(row.content || ''),
            chars: String(row.content || '').length,
        }))
        .filter((row) => row.content || row.enabled === false);
});

function snapshotPreset(value = preset.value) {
    return JSON.stringify(value || {});
}

async function refreshPresets() {
    userPresets.value = await listUserTavernPresets();
    const activeId = await getActiveTavernPresetId();
    const loaded = await loadActiveTavernPreset();
    preset.value = loaded;
    activePresetId.value = loaded.id || activeId || DEFAULT_XB_TAVERN_PRESET_ID;
    savedPresetJson.value = snapshotPreset(loaded);
    if (activeId !== activePresetId.value) {
        await setActiveTavernPresetId(activePresetId.value);
    }
}

async function deriveDefaultPreset() {
    const record = await deriveAndActivateDefaultTavernPreset();
    activePresetId.value = record.id;
    preset.value = record.preset;
    await refreshPresets();
    presetStatus.value = '已复制一份默认规则，可以开始修改。';
}

async function selectPreset(presetId: string) {
    await setActiveTavernPresetId(presetId);
    activePresetId.value = presetId || DEFAULT_XB_TAVERN_PRESET_ID;
    preset.value = await loadActiveTavernPreset();
    savedPresetJson.value = snapshotPreset(preset.value);
    selectedPresetSourceId.value = '';
    presetStatus.value = presetIsBuiltIn.value ? '当前使用默认规则，不能直接修改。' : '已切换到你的规则。';
}

async function saveCurrentPreset() {
    if (presetIsBuiltIn.value) {
        presetStatus.value = '默认规则不能直接改，请先复制一份。';
        return;
    }
    const record = await saveTavernPreset(preset.value);
    await setActiveTavernPresetId(record.id);
    activePresetId.value = record.id;
    preset.value = record.preset;
    savedPresetJson.value = snapshotPreset(record.preset);
    await refreshPresets();
    presetStatus.value = '规则已保存。';
}

async function resetToBuiltInPreset() {
    await setActiveTavernPresetId(DEFAULT_XB_TAVERN_PRESET_ID);
    activePresetId.value = DEFAULT_XB_TAVERN_PRESET_ID;
    preset.value = createDefaultXbTavernPreset();
    savedPresetJson.value = snapshotPreset(preset.value);
    selectedPresetSourceId.value = '';
    presetStatus.value = '已切回默认规则。';
}

function updatePresetSection(index: number, patch: Partial<XbTavernPresetSection>) {
    if (presetIsBuiltIn.value) {return;}
    const sections = [...(preset.value.sections || [])];
    sections[index] = {
        ...sections[index],
        ...patch,
    };
    preset.value = {
        ...preset.value,
        sections,
    };
}

function updatePresetMeta(patch: Partial<typeof preset.value>) {
    if (presetIsBuiltIn.value) {return;}
    preset.value = {
        ...preset.value,
        ...patch,
    };
}

function addPresetSection() {
    if (presetIsBuiltIn.value) {return;}
    const sections = [...(preset.value.sections || [])];
    const id = `custom-section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    sections.push({
        id,
        label: '新的补充规则',
        locked: false,
        enabled: true,
        placement: 'beforeHistory',
        role: 'system',
        content: '',
    });
    preset.value = {
        ...preset.value,
        sections,
    };
    selectedPresetSourceId.value = id;
}

function movePresetSection(index: number, direction: -1 | 1) {
    if (presetIsBuiltIn.value) {return;}
    const sections = [...(preset.value.sections || [])];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) {return;}
    const [section] = sections.splice(index, 1);
    sections.splice(nextIndex, 0, section);
    preset.value = {
        ...preset.value,
        sections,
    };
}

function removePresetSection(index: number) {
    if (presetIsBuiltIn.value) {return;}
    const sections = [...(preset.value.sections || [])];
    const removedId = sections[index]?.id || '';
    sections.splice(index, 1);
    preset.value = {
        ...preset.value,
        sections,
    };
    if (selectedPresetSourceId.value === removedId) {
        selectedPresetSourceId.value = '';
    }
}

async function discardPresetChanges() {
    if (presetIsBuiltIn.value || !presetDirty.value) {return;}
    preset.value = await loadActiveTavernPreset();
    savedPresetJson.value = snapshotPreset(preset.value);
    selectedPresetSourceId.value = '';
    presetStatus.value = '已放弃未保存的改动。';
}

function describeError(error: unknown) {
    return error instanceof Error ? error.message : String(error || 'unknown_error');
}

function postToHost(type: string, payload: Record<string, unknown> = {}) {
    window.parent?.postMessage({ source: SOURCE_APP, type, payload }, window.location.origin);
}

function createHostRequestId(prefix = 'host') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function requestHost(type: string, payload: Record<string, unknown> = {}, options: { timeoutMs?: number } = {}) {
    const requestId = createHostRequestId();
    postToHost(type, { ...payload, requestId });
    return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            pendingHostRequests.delete(requestId);
            reject(new Error('host_request_timeout'));
        }, Number(options.timeoutMs) || HOST_REQUEST_TIMEOUT_MS);
        pendingHostRequests.set(requestId, { resolve, reject, timer });
    });
}

function resolveHostRequest(payload: Record<string, unknown> = {}) {
    const requestId = String(payload.requestId || '');
    const pending = pendingHostRequests.get(requestId);
    if (!pending) {return;}
    window.clearTimeout(pending.timer);
    pendingHostRequests.delete(requestId);
    if (payload.ok === false) {
        pending.reject(new Error(String(payload.error || 'host_request_failed')));
        return;
    }
    pending.resolve(payload);
}

function installHostRequestHeadersProvider(payload: Record<string, unknown> = {}) {
    const fallbackHeaders = payload.hostRequestHeaders && typeof payload.hostRequestHeaders === 'object'
        ? payload.hostRequestHeaders as Record<string, unknown>
        : hostRequestHeaders.value;
    hostRequestHeaders.value = fallbackHeaders || {};
    setHostChatCompletionsRequestHeadersProvider(async () => {
        try {
            const result = await requestHost('xb-tavern:get-host-request-headers');
            return result.hostRequestHeaders && typeof result.hostRequestHeaders === 'object'
                ? result.hostRequestHeaders as Record<string, unknown>
                : hostRequestHeaders.value;
        } catch {
            return hostRequestHeaders.value;
        }
    });
}

function syncApiSettingsConfigFromAgentConfig() {
    apiSettingsPanelState.config = normalizeAgentConfig(agentConfig.value || {});
    apiSettingsPanelState.configDraft = null;
    apiSettingsPanelState.configFormSyncPending = true;
}

function beginApiConfigSave(requestId = '') {
    apiConfigSave.value = { status: 'saving', requestId, error: '' };
    apiSettingsPanelState.configSave = apiConfigSave.value;
    apiConfigStatus.value = '正在保存共享 API 配置...';
    void nextTick(renderApiSettingsPanel);
}

function completeApiConfigSave(requestId = '', result: { ok?: boolean; error?: string } = {}) {
    if (requestId && apiConfigSave.value.requestId && requestId !== apiConfigSave.value.requestId) {return;}
    apiConfigSave.value = {
        status: result.ok ? 'success' : 'error',
        requestId,
        error: result.error || '',
    };
    apiSettingsPanelState.configSave = apiConfigSave.value;
    apiConfigStatus.value = result.ok ? '共享 API 配置已保存。' : `保存失败：${result.error || 'unknown_error'}`;
    window.setTimeout(() => {
        if (apiConfigSave.value.requestId !== requestId || apiConfigSave.value.status !== 'success') {return;}
        apiConfigSave.value = { status: 'idle', requestId: '', error: '' };
        apiSettingsPanelState.configSave = apiConfigSave.value;
        apiConfigStatus.value = '';
        void nextTick(renderApiSettingsPanel);
    }, 1400);
    void nextTick(renderApiSettingsPanel);
}

function handleApiConfigSave(payload: { requestId?: string; payload?: Record<string, unknown> }) {
    const requestId = String(payload.requestId || `save-config-${Date.now()}`);
    beginApiConfigSave(requestId);
    postToHost('xb-tavern:save-config', {
        requestId,
        payload: payload.payload || {},
    });
}

function renderApiSettingsPanel() {
    const root = apiSettingsRootRef.value;
    if (!root) {return;}
    if (!apiSettingsPanel) {
        apiSettingsPanel = createAgentSettingsPanel({
            state: apiSettingsPanelState,
            render: renderApiSettingsPanel,
            describeError,
            showToast: (message: string) => {
                apiConfigStatus.value = String(message || '');
            },
            saveConfig: handleApiConfigSave,
            getRuntimeSummaryText: () => apiRuntimeLine.value,
        });
    }
    apiSettingsPanelState.configSave = apiConfigSave.value;
    // The settings panel markup is generated by our first-party shared config renderer.
    // eslint-disable-next-line no-unsanitized/property
    root.innerHTML = buildAgentSettingsPanelMarkup({
        configSave: apiConfigSave.value,
        runtimeText: apiRuntimeLine.value,
        inlineToastText: apiConfigStatus.value,
        showAssistantPermissions: false,
        showDelegateSettings: true,
        activePage: String(apiSettingsPanelState.configPage || 'main'),
        delegatePresetHint: '后续小白酒馆后台能力会复用这里的分身 API；当前聊天仍使用主 API。',
        isBusy: isRunning.value,
        canDeletePreset: Object.keys((apiSettingsPanelState.config as Record<string, unknown>)?.presets || {}).length > 1,
    });
    apiSettingsPanel.syncConfigToForm(root);
    apiSettingsPanel.bindSettingsPanelEvents(root);
}

function handleApiConfigSaved(payload: Record<string, unknown>) {
    const ok = payload.ok === true;
    if (ok) {
        agentConfig.value = payload.config as Record<string, unknown> || agentConfig.value;
        syncApiSettingsConfigFromAgentConfig();
        completeApiConfigSave(String(payload.requestId || ''), { ok: true });
        return;
    }
    syncApiSettingsConfigFromAgentConfig();
    completeApiConfigSave(String(payload.requestId || ''), {
        ok: false,
        error: String(payload.error || '保存失败'),
    });
}

function applyHostPayload(payload: Record<string, unknown>) {
    installHostRequestHeadersProvider(payload);
    context.value = payload.context as XbTavernContext || {};
    diagnostics.value = payload.diagnostics as TavernDiagnostics || {};
    if ('agentConfig' in payload) {
        agentConfig.value = payload.agentConfig as Record<string, unknown> || agentConfig.value;
        syncApiSettingsConfigFromAgentConfig();
    }
    availableCharacters.value = payload.availableCharacters as Array<{ id: string; name: string; avatar?: string }> || availableCharacters.value;
    selectedCharacterId.value = String(payload.selectedCharacterId || context.value.character?.id || selectedCharacterId.value || '');
    statusText.value = usingLockedSessionContext.value
        ? `${diagnostics.value.message || '宿主资料已加载'}；当前会话仍使用锁定资料。`
        : diagnostics.value.message || '宿主资料已加载';
    void nextTick(renderApiSettingsPanel);
}

function onHostMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin) {return;}
    const data = event.data || {};
    if (data.source !== SOURCE_HOST) {return;}
    if (data.type === 'xb-tavern:host-result') {
        resolveHostRequest(data.payload || {});
        return;
    }
    if (data.type === 'xb-tavern:config') {
        applyHostPayload(data.payload || {});
        return;
    }
    if (data.type === 'xb-tavern:context') {
        applyHostPayload(data.payload || {});
        return;
    }
    if (data.type === 'xb-tavern:config-saved') {
        handleApiConfigSaved(data.payload || {});
    }
}

function refreshSelectedCharacter() {
    statusText.value = '正在重新读取这张角色卡';
    postToHost('xb-tavern:refresh-context', {
        characterId: selectedCharacterId.value,
    });
}

function openBrainCheck(check: BrainCheck) {
    if (check.key === 'api') {
        activeView.value = 'settings';
        activeSettingsWorkspace.value = 'api';
        return;
    }
    activeView.value = 'inspect';
    activeWorkspace.value = check.key;
}

async function useLiveContextForPreview() {
    selectedSessionId.value = '';
    sessionMessages.value = [];
    runtimeText.value = '';
    runtimeError.value = '';
    runtimeSnapshotJson.value = '';
    await setSelectedTavernSessionId('');
}

async function refreshSessions() {
    sessions.value = await listTavernSessions();
    selectedSessionId.value = await getSelectedTavernSessionId();
    if (!selectedSessionId.value && sessions.value[0]) {
        selectedSessionId.value = sessions.value[0].id;
        await setSelectedTavernSessionId(selectedSessionId.value);
    }
    sessionMessages.value = selectedSessionId.value ? await listTavernMessages(selectedSessionId.value) : [];
    await refreshManagerRecords(selectedSessionId.value);
}

async function refreshManagerRecords(sessionId = selectedSessionId.value) {
    const id = String(sessionId || '').trim();
    if (!id) {
        turnSummaries.value = [];
        episodeSummaries.value = [];
        managerRuns.value = [];
        return;
    }
    const [turns, episodes, runs] = await Promise.all([
        listTavernTurnSummaries(id),
        listTavernEpisodeSummaries(id),
        listTavernManagerRuns(id, { limit: 18 }),
    ]);
    if (id !== selectedSessionId.value) {return;}
    turnSummaries.value = turns;
    episodeSummaries.value = episodes.reverse();
    managerRuns.value = runs;
}

async function rebuildSelectedSessionRuntimeState(messages: TavernMessageRecord[] = sessionMessages.value) {
    if (!selectedSessionId.value) {return;}
    const state = deriveTavernSessionStateFromMessages({
        messages,
        contextSnapshot: selectedSession.value?.contextSnapshot || context.value,
        preset: preset.value,
        historyMode: historyMode.value,
        diagnostics: diagnostics.value,
    });
    await replaceTavernSessionState(selectedSessionId.value, state);
    await refreshSessions();
}

async function createSessionFromContext() {
    const snapshotContext = context.value;
    const snapshotBrain = buildXbTavernBrain({
        context: snapshotContext,
        preset: preset.value,
        currentUserMessage: currentUserMessage.value,
        historyMode: historyMode.value,
        turn: 0,
        entryStates: {},
        diagnostics: diagnostics.value,
    });
    const session = await createTavernSession({
        title: `${snapshotContext.character?.name || '未选择角色'} · 小白酒馆`,
        characterId: String(snapshotContext.character?.id || ''),
        characterName: String(snapshotContext.character?.name || '未选择角色'),
        contextSnapshot: snapshotContext,
        buildSnapshot: snapshotBrain.buildSnapshot,
        presetId: String(preset.value.id || activePresetId.value || ''),
        presetName: String(preset.value.name || ''),
        state: {
            turn: 0,
            worldEntryStates: {},
        },
    });
    selectedSessionId.value = session.id;
    await refreshSessions();
    return session;
}

async function createSessionAndOpenChat() {
    await createSessionFromContext();
    activeView.value = 'chat';
}

async function refreshSelectedSessionSnapshot() {
    if (!selectedSessionId.value) {return;}
    const snapshotContext = context.value;
    const snapshotBrain = buildXbTavernBrain({
        context: snapshotContext,
        preset: preset.value,
        currentUserMessage: currentUserMessage.value,
        historyMode: historyMode.value,
        turn: sessionRuntimeState.value.turn,
        entryStates: sessionRuntimeState.value.worldEntryStates,
        diagnostics: diagnostics.value,
    });
    await updateTavernSessionSnapshot(selectedSessionId.value, {
        contextSnapshot: snapshotContext,
        buildSnapshot: snapshotBrain.buildSnapshot,
        presetId: String(preset.value.id || activePresetId.value || ''),
        presetName: String(preset.value.name || ''),
    });
    await refreshSessions();
}

async function selectSession(sessionId: string) {
    selectedSessionId.value = sessionId;
    await setSelectedTavernSessionId(sessionId);
    sessionMessages.value = await listTavernMessages(sessionId);
    await refreshManagerRecords(sessionId);
    activeView.value = 'chat';
}

function shortText(value = '', limit = 180) {
    const text = String(value || '').trim();
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function statusLabel(status = '') {
    const labels: Record<string, string> = {
        activated: '本次会带上',
        budget_skipped: '超出预算，未带上',
        not_matched: '本次未带上',
        secondary_not_matched: '二级关键词不满足',
        disabled: '已禁用',
        suppressed_by_decorator: '装饰器抑制',
        cooldown: '冷却中',
        delay: '延迟中',
        probability_failed: '概率判定未带上',
    };
    return labels[status] || status || '未知';
}

function managerStatusLabel(status = '') {
    const labels: Record<string, string> = {
        queued: '排队',
        running: '运行中',
        completed: '完成',
        failed: '失败',
    };
    return labels[status] || status || '未知';
}

function formatManagerSource(run: TavernManagerRunRecord) {
    return `第 ${run.turn || 0} 轮 · ${run.userOrder}/${run.assistantOrder}`;
}

function formatSummarySource(summary: TavernTurnSummaryRecord) {
    return `第 ${summary.turn || 0} 轮 · ${summary.userOrder}/${summary.assistantOrder}`;
}

function formatRunModelLine(run: TavernManagerRunRecord) {
    const provider = String(run.provider || '').trim();
    const model = String(run.model || '').trim();
    return [provider, model].filter(Boolean).join(' / ') || '未记录模型';
}

async function retryManagerRun(run: TavernManagerRunRecord) {
    if (!selectedSessionId.value || managerBusy.value) {return;}
    const messages = await listTavernMessages(selectedSessionId.value);
    const userMessage = messages.find((message) => message.order === run.userOrder && message.role === 'user');
    const assistantMessage = messages.find((message) => message.order === run.assistantOrder && message.role === 'assistant' && !message.error);
    if (!userMessage || !assistantMessage) {
        managerActionStatus.value = '原文楼层不存在，无法重试。';
        await refreshManagerRecords();
        return;
    }
    managerActionStatus.value = '后台管理者正在重试。';
    try {
        const result = await runXbTavernManagerAfterTurn({
            sessionId: selectedSessionId.value,
            agentConfig: agentConfig.value,
            userMessage,
            assistantMessage,
            turn: run.turn,
            trigger: 'manual_retry',
        });
        managerActionStatus.value = result.ok ? '' : `失败：${result.error || 'manager_retry_failed'}`;
    } catch (error) {
        managerActionStatus.value = error instanceof Error ? error.message : String(error || 'manager_retry_failed');
    } finally {
        await refreshManagerRecords();
    }
}

function candidateReason(entry: { status?: string; activationReason?: string; budgetShortfall?: number; budgetRemainingBefore?: number; matchedKeys?: string[]; matchedSecondaryKeys?: string[] }) {
    if (entry.status === 'activated') {
        const matched = [
            ...(entry.matchedKeys || []),
            ...(entry.matchedSecondaryKeys || []),
        ].filter(Boolean);
        if (matched.length) {return `触发关键词：${matched.join(', ')}`;}
        if (entry.activationReason === 'constant') {return '常驻条目，本次固定带上';}
        if (entry.activationReason === 'decorator') {return '装饰器要求本次带上';}
        if (entry.activationReason === 'sticky') {return '粘滞状态，本次继续带上';}
        return '本次会带上';
    }
    if (entry.status === 'budget_skipped') {
        const shortfall = Number(entry.budgetShortfall) || 0;
        return shortfall > 0 ? `预算不足，差 ${shortfall} 字` : '预算跳过';
    }
    return statusLabel(entry.status || '');
}

function roleLabel(role = '') {
    const labels: Record<string, string> = {
        system: '规则',
        user: '用户',
        assistant: 'AI',
        tool: '工具结果',
    };
    return labels[role] || role || '未知';
}

function formatMessageTime(value: unknown) {
    const timestamp = Number(value) || 0;
    if (!timestamp) {return '';}
    try {
        return new Intl.DateTimeFormat('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(timestamp));
    } catch {
        return '';
    }
}

function markdownSignature(text = '') {
    const raw = String(text || '');
    let hash = 0;
    for (let index = 0; index < raw.length; index += 1) {
        hash = ((hash * 31) + raw.charCodeAt(index)) >>> 0;
    }
    return `${raw.length}:${hash.toString(36)}`;
}

function renderChatMarkdown(text = '') {
    // renderMarkdownToHtml sanitizes through DOMPurify when SillyTavern exposes it,
    // matching the ebook/assistant Markdown pipeline before Vue inserts the HTML.
    const raw = String(text || '');
    const canCache = !/(^|\n)(`{3,}|~{3,})[ \t]*(html|htm|xhtml|xml|svg|vue|svelte)?\b/i.test(raw)
        && !/^<!doctype\s+html/i.test(raw.trim())
        && !/^<html[\s>]/i.test(raw.trim());
    const cacheKey = markdownSignature(raw);
    if (canCache && markdownHtmlCache.has(cacheKey)) {
        return markdownHtmlCache.get(cacheKey) || '';
    }
    const html = renderMarkdownToHtml(raw);
    if (canCache) {
        markdownHtmlCache.set(cacheKey, html);
        if (markdownHtmlCache.size > 160) {
            const firstKey = markdownHtmlCache.keys().next().value;
            if (firstKey) {markdownHtmlCache.delete(firstKey);}
        }
    }
    return html;
}

function enhanceChatMarkdown() {
    const root = chatScrollRef.value;
    if (!root?.querySelectorAll) {return;}
    root.querySelectorAll<HTMLElement>('.xb-tavern-markdown').forEach((node) => {
        const signature = node.dataset.markdownSignature || '';
        enhanceMarkdownContent(node, {
            codeBlockClassName: 'xb-tavern-codeblock',
            codeCopyClassName: 'xb-tavern-code-copy',
        });
        node.dataset.markdownEnhanced = signature;
    });
}

function messageKey(message: TavernMessageRecord) {
    return `${message.sessionId}:${message.order}`;
}

function canEditMessage(message: TavernMessageRecord) {
    return !isRunning.value && !message.error && ['user', 'assistant'].includes(message.role);
}

function isEditingMessage(message: TavernMessageRecord) {
    return editingMessageKey.value === messageKey(message);
}

function flashMessageAction(message: TavernMessageRecord, action: string, ok: boolean) {
    const key = `${messageKey(message)}:${action}`;
    messageActionFeedback.value = {
        ...messageActionFeedback.value,
        [key]: ok ? 'success' : 'error',
    };
    window.setTimeout(() => {
        const next = { ...messageActionFeedback.value };
        delete next[key];
        messageActionFeedback.value = next;
    }, 1100);
}

function actionFeedback(message: TavernMessageRecord, action: string) {
    return messageActionFeedback.value[`${messageKey(message)}:${action}`] || '';
}

async function copyTextWithFallback(text = '') {
    const normalized = String(text || '');
    if (!normalized) {return false;}
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(normalized);
            return true;
        }
    } catch {
        // Fall through to the legacy path.
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

async function copyMessage(message: TavernMessageRecord) {
    const ok = await copyTextWithFallback(message.content || '');
    flashMessageAction(message, 'copy', ok);
}

function startEditMessage(message: TavernMessageRecord) {
    if (!canEditMessage(message)) {return;}
    editingMessageKey.value = messageKey(message);
    editingMessageDraft.value = message.content || '';
    void nextTick(() => {
        const textarea = chatScrollRef.value?.querySelector<HTMLTextAreaElement>(`[data-message-editor="${messageKey(message)}"]`);
        if (!textarea) {return;}
        autoSizeTextarea(textarea);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
}

function cancelEditMessage() {
    editingMessageKey.value = '';
    editingMessageDraft.value = '';
}

function autoSizeTextarea(textarea: HTMLTextAreaElement | null) {
    if (!textarea) {return;}
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 144), 420)}px`;
}

function handleEditKeydown(event: KeyboardEvent, message: TavernMessageRecord) {
    if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditMessage();
        return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveEditMessage(message);
    }
}

function handleEditInput(event: Event) {
    autoSizeTextarea(event.target as HTMLTextAreaElement);
}

function handleComposeInput(event: Event) {
    autoSizeTextarea(event.target as HTMLTextAreaElement);
}

async function saveEditMessage(message: TavernMessageRecord, options: { rerun?: boolean } = {}) {
    if (!canEditMessage(message)) {return;}
    const content = editingMessageDraft.value.trim();
    if (!content) {
        flashMessageAction(message, 'edit', false);
        return;
    }
    const updated = await updateTavernMessage(message.sessionId, message.order, { content });
    if (updated) {
        await markTavernMemoryStaleFromOrder(message.sessionId, message.order);
    }
    if (updated && selectedSessionId.value) {
        sessionMessages.value = await listTavernMessages(selectedSessionId.value);
        await refreshManagerRecords(selectedSessionId.value);
    }
    cancelEditMessage();
    flashMessageAction(updated || message, 'edit', !!updated);
    if (updated && options.rerun) {
        await rerunFromMessage(updated);
    } else if (updated) {
        await rebuildSelectedSessionRuntimeState();
    }
}

function findDeleteOrders(message: TavernMessageRecord) {
    if (message.role !== 'user') {return [message.order];}
    const sorted = [...sessionMessages.value].sort((left, right) => left.order - right.order);
    const startIndex = sorted.findIndex((item) => item.order === message.order);
    if (startIndex < 0) {return [message.order];}
    const orders: number[] = [];
    for (let index = startIndex; index < sorted.length; index += 1) {
        const item = sorted[index];
        if (index > startIndex && item.role === 'user') {break;}
        orders.push(item.order);
    }
    return orders;
}

async function deleteMessageTurn(message: TavernMessageRecord) {
    if (isRunning.value) {return;}
    const deleted = await deleteTavernMessages(message.sessionId, findDeleteOrders(message));
    if (deleted > 0) {
        await markTavernMemoryStaleFromOrder(message.sessionId, message.order);
    }
    if (selectedSessionId.value) {
        sessionMessages.value = await listTavernMessages(selectedSessionId.value);
        await refreshManagerRecords(selectedSessionId.value);
    }
    if (deleted > 0) {
        await rebuildSelectedSessionRuntimeState();
    }
    if (editingMessageKey.value.startsWith(`${message.sessionId}:`)) {
        cancelEditMessage();
    }
    flashMessageAction(message, 'delete', deleted > 0);
}

async function rerunFromMessage(message: TavernMessageRecord) {
    if (isRunning.value) {return;}
    const sorted = [...sessionMessages.value].sort((left, right) => left.order - right.order);
    const index = sorted.findIndex((item) => item.order === message.order);
    const userMessage = message.role === 'user'
        ? message
        : [...sorted.slice(0, Math.max(0, index + 1))].reverse().find((item) => item.role === 'user');
    if (!userMessage) {
        flashMessageAction(message, 'rerun', false);
        return;
    }
    const ordersToDelete = sorted
        .filter((item) => item.order > userMessage.order)
        .map((item) => item.order);
    await deleteTavernMessages(userMessage.sessionId, ordersToDelete);
    await markTavernMemoryStaleFromOrder(userMessage.sessionId, userMessage.order);
    if (selectedSessionId.value) {
        sessionMessages.value = await listTavernMessages(selectedSessionId.value);
        await refreshManagerRecords(selectedSessionId.value);
    }
    flashMessageAction(message, 'rerun', true);
    await runOnce({
        messageText: userMessage.content,
        reuseUserMessageOrder: userMessage.order,
    });
}

function insertionTargetLabel(target = '') {
    const text = String(target || '');
    const exact: Record<string, string> = {
        'before character card': '角色卡前',
        'after character card': '角色卡后',
        'author note top': '作者备注前段',
        'author note bottom': '作者备注后段',
        'example messages top': '示例对话前段',
        'example messages bottom': '示例对话后段',
    };
    if (exact[text]) {return exact[text];}
    if (text.startsWith('history depth ')) {
        return `插入历史第 ${text.replace('history depth ', '')} 层`;
    }
    if (text.startsWith('outlet:')) {
        return `自定义出口：${text.replace('outlet:', '')}`;
    }
    return text || '未指定位置';
}

function updateChatScrollButtons() {
    const node = chatScrollRef.value;
    if (!node) {
        showChatScrollTop.value = false;
        showChatScrollBottom.value = false;
        return;
    }
    const threshold = 80;
    showChatScrollTop.value = node.scrollTop > threshold;
    showChatScrollBottom.value = node.scrollHeight - node.scrollTop - node.clientHeight > threshold;
}

function scheduleHideChatScrollHelpers() {
    chatScrollControlsActive.value = true;
    if (chatScrollHideTimer) {
        window.clearTimeout(chatScrollHideTimer);
    }
    chatScrollHideTimer = window.setTimeout(() => {
        chatScrollControlsActive.value = false;
        chatScrollHideTimer = null;
    }, 1500);
}

function isChatNearBottom() {
    const node = chatScrollRef.value;
    if (!node) {return true;}
    return node.scrollHeight - node.scrollTop - node.clientHeight <= 56;
}

function scrollChatToBottom(force = false) {
    if (!force && !chatAutoScroll.value) {return;}
    if (force) {chatAutoScroll.value = true;}
    void nextTick(() => {
        const node = chatScrollRef.value;
        if (!node) {return;}
        node.scrollTop = node.scrollHeight;
        requestAnimationFrame(() => {
            node.scrollTop = node.scrollHeight;
            updateChatScrollButtons();
            scheduleHideChatScrollHelpers();
        });
    });
}

function scrollChatToTop() {
    const node = chatScrollRef.value;
    if (!node) {return;}
    chatAutoScroll.value = false;
    chatLastScrollTop = 0;
    node.scrollTop = 0;
    updateChatScrollButtons();
    scheduleHideChatScrollHelpers();
}

function handleChatScroll() {
    const node = chatScrollRef.value;
    if (!node) {return;}
    const currentScrollTop = Number(node.scrollTop || 0);
    const scrollingTowardBottom = currentScrollTop > chatLastScrollTop;
    chatLastScrollTop = currentScrollTop;
    const nearBottom = isChatNearBottom();
    if (nearBottom) {
        if (chatAutoScroll.value !== false || scrollingTowardBottom) {
            chatAutoScroll.value = true;
        }
    } else {
        chatAutoScroll.value = false;
    }
    if (chatScrollTicking) {return;}
    chatScrollTicking = true;
    requestAnimationFrame(() => {
        updateChatScrollButtons();
        scheduleHideChatScrollHelpers();
        chatScrollTicking = false;
    });
}

function handleChatWheel(event: WheelEvent) {
    if (Number(event.deltaY || 0) < 0) {
        chatAutoScroll.value = false;
    }
}

function handleChatTouchStart(event: TouchEvent) {
    chatTouchStartY = Number(event.touches?.[0]?.clientY);
}

function handleChatTouchMove(event: TouchEvent) {
    const currentY = Number(event.touches?.[0]?.clientY);
    if (!Number.isFinite(Number(chatTouchStartY)) || !Number.isFinite(currentY)) {
        chatAutoScroll.value = false;
        return;
    }
    if (chatTouchStartY !== null && currentY > chatTouchStartY + 4) {
        chatAutoScroll.value = false;
    }
}

function handleComposeKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') {return;}
    if (event.isComposing || event.shiftKey || event.altKey) {return;}
    const shouldSend = event.ctrlKey || event.metaKey || window.innerWidth >= 760;
    if (!shouldSend) {return;}
    event.preventDefault();
    void runOnce();
}

function cancelActiveRun() {
    activeRunController.value?.abort();
}

function handleChatSubmit() {
    void runOnce();
}

async function runOnce(options: { messageText?: string; reuseUserMessageOrder?: number } = {}) {
    if (isRunning.value) {
        cancelActiveRun();
        return;
    }
    const messageText = String(options.messageText ?? currentUserMessage.value ?? '').trim();
    if (!messageText) {
        runtimeError.value = '先写一句要发给角色的话。';
        return;
    }
    const controller = new AbortController();
    activeRunController.value = controller;
    runtimeError.value = '';
    runtimeText.value = '';
    runtimeProvider.value = '';
    runtimeModel.value = '';
    runtimeSnapshotJson.value = JSON.stringify({
        status: 'running',
    }, null, 2);
    isRunning.value = true;
    chatAutoScroll.value = true;
    try {
        const result = await runXbTavernTurn({
            sessionId: selectedSessionId.value,
            agentConfig: agentConfig.value,
            contextSnapshot: context.value,
            preset: preset.value,
            currentUserMessage: messageText,
            runtimeState: normalizeTavernSessionState(selectedSession.value?.state || {}),
            diagnostics: diagnostics.value,
            historyMode: historyMode.value,
            signal: controller.signal,
            reuseUserMessageOrder: options.reuseUserMessageOrder,
            runManager: true,
            onStreamProgress: (snapshot) => {
                if (typeof snapshot.text === 'string') {runtimeText.value = snapshot.text;}
            },
            onUserMessageSaved: async (sessionId, message) => {
                selectedSessionId.value = sessionId;
                await setSelectedTavernSessionId(sessionId);
                const exists = sessionMessages.value.some((item) => item.sessionId === message.sessionId && item.order === message.order);
                sessionMessages.value = exists ? sessionMessages.value : [...sessionMessages.value, message].sort((left, right) => left.order - right.order);
                currentUserMessage.value = '';
                await refreshSessions();
                scrollChatToBottom(true);
            },
            onAssistantMessageSaved: async (sessionId, message) => {
                selectedSessionId.value = sessionId;
                const exists = sessionMessages.value.some((item) => item.sessionId === message.sessionId && item.order === message.order);
                sessionMessages.value = exists ? sessionMessages.value : [...sessionMessages.value, message].sort((left, right) => left.order - right.order);
                await refreshSessions();
                scrollChatToBottom(true);
            },
            onManagerRunSaved: async (sessionId) => {
                await refreshManagerRecords(sessionId);
            },
        });
        selectedSessionId.value = result.sessionId;
        runtimeText.value = '';
        runtimeError.value = result.error || '';
        runtimeProvider.value = result.provider || '';
        runtimeModel.value = result.model || '';
        runtimeSnapshotJson.value = JSON.stringify({
            provider: result.provider || '',
            model: result.model || '',
            previewMatchesRequest: result.previewMatchesRequest,
            nextTurn: result.nextTurn,
            buildSnapshot: result.buildSnapshot,
            requestSnapshot: result.requestSnapshot,
            error: result.error || '',
        }, null, 2);
        await refreshSessions();
        await refreshManagerRecords(result.sessionId);
        scrollChatToBottom(true);
    } catch (error) {
        runtimeError.value = error instanceof Error ? error.message : String(error || 'run_failed');
    } finally {
        if (activeRunController.value === controller) {
            activeRunController.value = null;
        }
        isRunning.value = false;
        scrollChatToBottom(true);
    }
}

watch([
    () => chatMessages.value.length,
    () => chatMarkdownSignature.value,
    () => runtimeText.value,
    () => activeView.value,
], () => {
    if (activeView.value === 'chat') {
        scrollChatToBottom();
        void nextTick(() => {
            enhanceChatMarkdown();
            updateChatScrollButtons();
        });
    }
});

watch([
    () => activeWorkspace.value,
    () => activeSettingsWorkspace.value,
    () => activeView.value,
    () => apiConfigSave.value.status,
    () => agentConfig.value,
], () => {
    if (activeView.value === 'settings' && activeSettingsWorkspace.value === 'api') {
        void nextTick(renderApiSettingsPanel);
    }
});

onMounted(async () => {
    // onHostMessage validates origin and message source before accepting payloads.
    // eslint-disable-next-line no-restricted-syntax
    window.addEventListener('message', onHostMessage);
    await refreshPresets();
    await refreshSessions();
    syncApiSettingsConfigFromAgentConfig();
    postToHost('xb-tavern:frame-ready');
});

onUnmounted(() => {
    window.removeEventListener('message', onHostMessage);
    setHostChatCompletionsRequestHeadersProvider(null);
    pendingHostRequests.forEach((request) => {
        window.clearTimeout(request.timer);
        request.reject(new Error('tavern_unmounted'));
    });
    pendingHostRequests.clear();
    activeRunController.value?.abort();
    if (chatScrollHideTimer) {
        window.clearTimeout(chatScrollHideTimer);
        chatScrollHideTimer = null;
    }
});
</script>

<template>
  <main class="xb-tavern">
    <header class="xb-topbar">
      <div>
        <p class="eyebrow">
          LittleWhiteBox Tavern
        </p>
        <h1>小白酒馆</h1>
      </div>
      <nav
        class="view-tabs"
        aria-label="小白酒馆页面"
      >
        <button
          type="button"
          :class="{ active: activeView === 'home' }"
          @click="activeView = 'home'"
        >
          首页
        </button>
        <button
          type="button"
          :class="{ active: activeView === 'chat' }"
          @click="activeView = 'chat'"
        >
          聊天
        </button>
        <button
          type="button"
          :class="{ active: activeView === 'inspect' }"
          @click="activeView = 'inspect'"
        >
          检查
        </button>
        <button
          type="button"
          :class="{ active: activeView === 'settings' }"
          @click="activeView = 'settings'"
        >
          设置
        </button>
        <button
          class="icon-button"
          type="button"
          title="关闭"
          @click="postToHost('xb-tavern:close')"
        >
          ×
        </button>
      </nav>
    </header>

    <section
      v-if="activeView === 'home'"
      class="tavern-home"
    >
      <div class="home-hero">
        <div>
          <p class="eyebrow">
            首页
          </p>
          <h2>小白酒馆</h2>
          <p>
            {{ characterName }} · {{ chatReadyLabel }}
          </p>
        </div>
        <div class="home-actions">
          <button
            type="button"
            class="primary-action"
            @click="selectedSessionId ? activeView = 'chat' : createSessionAndOpenChat()"
          >
            {{ selectedSessionId ? '进入聊天' : '开始聊天' }}
          </button>
          <button
            type="button"
            @click="createSessionAndOpenChat"
          >
            新开会话
          </button>
          <button
            type="button"
            @click="activeView = 'inspect'; activeWorkspace = 'snapshot'"
          >
            选择角色
          </button>
          <button
            type="button"
            @click="activeView = 'inspect'; activeWorkspace = 'world'"
          >
            资料检查
          </button>
          <button
            type="button"
            @click="activeView = 'settings'"
          >
            设置
          </button>
        </div>
      </div>

      <section class="session-board">
        <div class="panel-head">
          <div>
            <h2>最近会话</h2>
          </div>
          <button
            type="button"
            @click="createSessionAndOpenChat"
          >
            新开会话
          </button>
        </div>
        <div class="home-session-list">
          <button
            v-for="session in sessions"
            :key="session.id"
            type="button"
            :class="{ active: session.id === selectedSessionId }"
            @click="selectSession(session.id)"
          >
            <strong>{{ session.title }}</strong>
            <small>{{ session.characterName || '未选择角色' }}</small>
          </button>
          <p
            v-if="!sessions.length"
            class="muted"
          >
            还没有小白酒馆会话。
          </p>
        </div>
      </section>
    </section>

    <section
      v-if="activeView === 'chat'"
      class="tavern-chat"
      :class="`chat-focus-${chatFocus}`"
    >
      <aside class="chat-side">
        <section class="chat-profile">
          <div class="avatar-orb">
            {{ characterName.slice(0, 1) }}
          </div>
          <div>
            <p class="eyebrow">
              角色
            </p>
            <h2>{{ characterName }}</h2>
            <p>{{ contextSourceTitle }}</p>
          </div>
        </section>

        <section class="chat-side-block">
          <div class="chat-workspace-switch">
            <button
              type="button"
              :class="{ active: chatFocus === 'chat' }"
              @click="chatFocus = 'chat'"
            >
              聊天
            </button>
            <button
              type="button"
              :class="{ active: chatFocus === 'balanced' }"
              @click="chatFocus = 'balanced'"
            >
              平衡
            </button>
            <button
              type="button"
              :class="{ active: chatFocus === 'manager' }"
              @click="chatFocus = 'manager'"
            >
              管理
            </button>
          </div>
        </section>

        <section class="chat-side-block">
          <div class="side-stat">
            <span>状态</span>
            <strong>{{ selectedSessionTitle }}</strong>
          </div>
          <div class="side-stat">
            <span>轮次</span>
            <strong>第 {{ sessionRuntimeState.turn || 0 }} 轮</strong>
          </div>
          <div class="side-stat">
            <span>位置</span>
            <strong>地图预留</strong>
          </div>
        </section>

        <section class="chat-map-panel">
          <strong>地图</strong>
          <div class="map-placeholder">
            <span>位置预留</span>
          </div>
        </section>

        <section
          v-if="usingLockedSessionContext"
          class="chat-lock-note"
        >
          <strong>会话资料已锁定</strong>
          <span>角色卡或世界书改动后，需要手动刷新当前会话。</span>
          <button
            type="button"
            @click="refreshSelectedSessionSnapshot"
          >
            刷新会话资料
          </button>
        </section>

        <section class="chat-side-block">
          <div class="side-block-head">
            <strong>会话</strong>
            <button
              type="button"
              @click="createSessionAndOpenChat"
            >
              新建
            </button>
          </div>
          <div class="session-list">
            <button
              v-for="session in sessions"
              :key="session.id"
              type="button"
              :class="{ active: session.id === selectedSessionId }"
              @click="selectSession(session.id)"
            >
              <strong>{{ session.title }}</strong>
              <small>{{ session.characterName || '未选择角色' }}</small>
            </button>
            <p
              v-if="!sessions.length"
              class="muted compact"
            >
              还没有会话。
            </p>
          </div>
        </section>
      </aside>

      <section class="chat-main">
        <header class="chat-head">
          <div>
            <p class="eyebrow">
              {{ chatReadyLabel }}
            </p>
            <h2>{{ selectedSessionTitle }}</h2>
            <p>{{ chatSubtitle }}</p>
          </div>
          <div class="chat-head-actions">
            <button
              type="button"
              @click="chatFocus = 'manager'"
            >
              管理
            </button>
            <button
              type="button"
              @click="activeView = 'inspect'; activeWorkspace = 'messages'"
            >
              检查
            </button>
            <button
              type="button"
              @click="activeView = 'home'"
            >
              首页
            </button>
          </div>
        </header>
        <div
          ref="chatScrollRef"
          class="chat-scroll"
          @scroll="handleChatScroll"
          @wheel.passive="handleChatWheel"
          @touchstart.passive="handleChatTouchStart"
          @touchmove.passive="handleChatTouchMove"
        >
          <div
            v-for="message in chatMessages"
            :key="`${message.sessionId}-${message.order}`"
            class="chat-bubble"
            :class="[
              message.role === 'user' ? 'from-user' : 'from-assistant',
              { 'is-error': message.error },
            ]"
          >
            <div class="bubble-meta">
              <span>{{ message.error ? '错误' : roleLabel(message.role) }}</span>
              <small>{{ formatMessageTime(message.createdAt) }}</small>
            </div>
            <div
              v-if="isEditingMessage(message)"
              class="message-edit-panel"
            >
              <textarea
                v-model="editingMessageDraft"
                class="message-edit-box"
                rows="6"
                :data-message-editor="messageKey(message)"
                @input="handleEditInput"
                @keydown="handleEditKeydown($event, message)"
              />
              <div class="message-edit-actions">
                <button
                  type="button"
                  @click="saveEditMessage(message)"
                >
                  保存
                </button>
                <button
                  type="button"
                  @click="saveEditMessage(message, { rerun: true })"
                >
                  保存并重跑
                </button>
                <button
                  type="button"
                  @click="cancelEditMessage"
                >
                  取消
                </button>
              </div>
            </div>
            <div
              v-else
              class="xb-tavern-markdown"
              :data-markdown-signature="markdownSignature(message.content)"
              v-html="renderChatMarkdown(message.content)"
            />
            <div
              v-if="!isEditingMessage(message)"
              class="message-actions"
            >
              <button
                type="button"
                :class="actionFeedback(message, 'copy')"
                title="复制"
                aria-label="复制"
                @click="copyMessage(message)"
              >
                ⧉
              </button>
              <button
                type="button"
                :disabled="!canEditMessage(message)"
                :class="actionFeedback(message, 'edit')"
                title="编辑"
                aria-label="编辑"
                @click="startEditMessage(message)"
              >
                ✎
              </button>
              <button
                type="button"
                :disabled="isRunning"
                :class="actionFeedback(message, 'rerun')"
                title="重新生成"
                aria-label="重新生成"
                @click="rerunFromMessage(message)"
              >
                ↻
              </button>
              <button
                type="button"
                :disabled="isRunning"
                :class="actionFeedback(message, 'delete')"
                title="删除"
                aria-label="删除"
                @click="deleteMessageTurn(message)"
              >
                🗑
              </button>
            </div>
          </div>
          <div
            v-if="isRunning && runtimeText"
            class="chat-bubble from-assistant streaming"
          >
            <div class="bubble-meta">
              <span>AI</span>
              <small>生成中</small>
            </div>
            <div
              class="xb-tavern-markdown"
              :data-markdown-signature="markdownSignature(runtimeText)"
              v-html="renderChatMarkdown(runtimeText)"
            />
          </div>
          <div
            v-if="isRunning && !runtimeText"
            class="chat-bubble from-assistant streaming thinking"
          >
            <div class="bubble-meta">
              <span>AI</span>
              <small>生成中</small>
            </div>
            <p>正在组织回复...</p>
          </div>
          <p
            v-if="!chatMessages.length && !isRunning"
            class="chat-empty"
          >
            这里还没有消息。下面写一句话，开始和这个角色说话。
          </p>
          <div
            class="chat-scroll-helpers"
            :class="{ active: chatScrollControlsActive }"
          >
            <button
              type="button"
              :class="{ visible: showChatScrollTop }"
              title="回到顶部"
              aria-label="回到顶部"
              @click="scrollChatToTop"
            >
              ▲
            </button>
            <button
              type="button"
              :class="{ visible: showChatScrollBottom }"
              title="回到底部"
              aria-label="回到底部"
              @click="scrollChatToBottom(true)"
            >
              ▼
            </button>
          </div>
        </div>
        <form
          class="chat-compose"
          @submit.prevent="handleChatSubmit"
        >
          <div
            v-if="latestErrorMessage"
            class="compose-error"
          >
            {{ latestErrorMessage }}
          </div>
          <textarea
            v-model="currentUserMessage"
            rows="3"
            placeholder="对角色说一句话..."
            :disabled="isRunning"
            @input="handleComposeInput"
            @keydown="handleComposeKeydown"
          />
          <button
            type="submit"
            class="primary-action"
            :disabled="!canSendMessage"
          >
            {{ isRunning ? '停止' : '发送' }}
          </button>
        </form>
      </section>

      <aside class="chat-manager">
        <header class="manager-head">
          <div>
            <p class="eyebrow">
              管理
            </p>
            <h2>后台管理者</h2>
            <p>{{ managerStatusLine }}</p>
          </div>
          <button
            type="button"
            @click="refreshManagerRecords()"
          >
            刷新
          </button>
          <button
            type="button"
            @click="chatFocus = 'chat'"
          >
            聊天
          </button>
        </header>

        <section class="manager-section">
          <div class="side-block-head">
            <strong>阶段大总结</strong>
            <span>{{ episodeSummaries.length }}</span>
          </div>
          <article
            v-for="episode in episodeSummaries"
            :key="episode.id"
            class="manager-card"
          >
            <strong>{{ episode.title }}</strong>
            <small>第 {{ episode.startTurn }}-{{ episode.endTurn }} 轮</small>
            <p>{{ episode.summary || '暂无摘要。' }}</p>
            <p v-if="episode.unresolved?.length">
              未解决：{{ episode.unresolved.join('、') }}
            </p>
          </article>
          <p
            v-if="!episodeSummaries.length"
            class="muted compact"
          >
            还没有阶段大总结。
          </p>
        </section>

        <section class="manager-section">
          <div class="side-block-head">
            <strong>每轮小总结</strong>
            <span>{{ turnSummaries.length }}</span>
          </div>
          <article
            v-for="summary in recentTurnSummaries"
            :key="summary.id"
            class="manager-card"
          >
            <strong>{{ formatSummarySource(summary) }}</strong>
            <small>{{ summary.tags?.join('、') || '无标签' }}</small>
            <p>{{ summary.summary }}</p>
          </article>
          <p
            v-if="!turnSummaries.length"
            class="muted compact"
          >
            还没有小总结。
          </p>
        </section>

        <section class="manager-section">
          <div class="side-block-head">
            <strong>工作记录</strong>
            <span>{{ managerRuns.length }}</span>
          </div>
          <article
            v-for="run in managerRuns"
            :key="run.id"
            class="manager-card"
            :class="`is-${run.status}`"
          >
            <div class="manager-run-title">
              <strong>{{ managerStatusLabel(run.status) }}</strong>
              <small>{{ formatManagerSource(run) }}</small>
            </div>
            <p>{{ run.inputSummary }}</p>
            <small>{{ formatRunModelLine(run) }}</small>
            <p v-if="run.parsedAction">
              动作：{{ run.parsedAction }}
            </p>
            <details v-if="run.outputText">
              <summary>输出</summary>
              <pre>{{ run.outputText }}</pre>
            </details>
            <p v-if="run.error">
              {{ run.error }}
            </p>
            <button
              v-if="run.status === 'failed'"
              type="button"
              :disabled="managerBusy"
              @click="retryManagerRun(run)"
            >
              重试
            </button>
          </article>
          <p
            v-if="!managerRuns.length"
            class="muted compact"
          >
            还没有工作记录。
          </p>
        </section>
      </aside>
    </section>

    <section
      v-if="activeView === 'inspect'"
      class="xb-layout"
    >
      <aside class="xb-sidebar">
        <div class="panel guide-card">
          <h2>检查</h2>
          <div class="guide-steps">
            <button
              v-for="tab in workspaceTabs"
              :key="tab.key"
              type="button"
              class="guide-step"
              :class="{ active: activeWorkspace === tab.key }"
              @click="activeWorkspace = tab.key"
            >
              <strong>{{ tab.label }}</strong>
              <span>{{ tab.hint }}</span>
            </button>
          </div>
        </div>

        <div class="panel">
          <h2>当前选择</h2>
          <p class="context-source">
            <strong>{{ contextSourceTitle }}</strong>
            <span>{{ contextSourceDetail }}</span>
          </p>
          <dl class="kv">
            <dt>角色</dt>
            <dd>{{ characterName }}</dd>
            <dt>用户</dt>
            <dd>{{ userName }}</dd>
            <dt>世界书</dt>
            <dd>{{ worldBookCount }} 本 / {{ worldEntryCount }} 条</dd>
            <dt>会带上</dt>
            <dd>{{ activatedCount }} 条</dd>
            <dt>API</dt>
            <dd>{{ apiRuntimeLine }}</dd>
          </dl>
          <label
            class="field-label"
            for="xb-character-select"
          >角色卡</label>
          <select
            id="xb-character-select"
            v-model="selectedCharacterId"
            @change="refreshSelectedCharacter"
          >
            <option
              v-for="character in availableCharacters"
              :key="character.id"
              :value="character.id"
            >
              {{ character.name }}
            </option>
          </select>
          <button
            type="button"
            @click="refreshSelectedCharacter"
          >
            从酒馆重新读取
          </button>
          <button
            v-if="usingLockedSessionContext"
            type="button"
            @click="useLiveContextForPreview"
          >
            改用刚读取资料
          </button>
        </div>

        <div class="panel">
          <h2>准备状态</h2>
          <ul class="diagnostics">
            <li
              v-for="row in diagnosticRows"
              :key="row"
            >
              {{ row }}
            </li>
          </ul>
        </div>

        <div class="panel">
          <h2>会话</h2>
          <p class="muted">
            {{ selectedSessionTitle }}
          </p>
          <button
            type="button"
            @click="createSessionFromContext"
          >
            用刚读取资料开始新会话
          </button>
          <button
            type="button"
            :disabled="!selectedSessionId"
            @click="refreshSelectedSessionSnapshot"
          >
            把刚读取资料写入当前会话
          </button>
          <button
            v-if="usingLockedSessionContext"
            type="button"
            @click="useLiveContextForPreview"
          >
            不用旧会话，直接看刚读取资料
          </button>
          <div class="session-list">
            <button
              v-for="session in sessions"
              :key="session.id"
              type="button"
              :class="{ active: session.id === selectedSessionId }"
              @click="selectSession(session.id)"
            >
              {{ session.title }}
            </button>
          </div>
        </div>
      </aside>

      <section class="xb-main">
        <div class="panel workspace-panel">
          <div class="panel-head">
            <div>
              <h2>{{ activeWorkspaceItem.label }}</h2>
              <p class="muted compact">
                {{ activeWorkspaceItem.hint }}
              </p>
            </div>
            <span class="pill">
              {{ characterName }}
            </span>
          </div>
          <div class="brain-checks compact-checks">
            <button
              v-for="check in brainChecks"
              :key="check.label"
              type="button"
              class="brain-check"
              :class="{ ok: check.ok, warn: !check.ok }"
              @click="openBrainCheck(check)"
            >
              <span class="check-mark">{{ check.ok ? '✓' : '!' }}</span>
              <span>
                <strong>{{ check.label }}</strong>
                <small>{{ check.detail }}</small>
              </span>
            </button>
          </div>
        </div>

        <div
          v-show="activeWorkspace === 'snapshot'"
          class="panel step-panel"
        >
          <div class="panel-head">
            <div>
              <h2>资料</h2>
              <p class="muted compact">
                先确认小白酒馆读到的是你想测试的角色，不要在错角色上继续验。
              </p>
            </div>
            <span class="pill">历史 {{ effectiveHistoryCount }} 条</span>
          </div>
          <div class="what-to-check">
            <strong>你要判断：</strong>
            <span>角色名、用户 persona、角色描述、首条消息和世界书来源是不是这次要测试的资料。</span>
          </div>
          <div
            v-if="usingLockedSessionContext"
            class="context-warning"
          >
            <strong>你现在看的不是刚读取资料。</strong>
            <span>当前选中了旧会话，页面和试聊都在用会话锁定资料。刚改过世界书时，先点“改用刚读取资料”，或把刚读取资料写入当前会话。</span>
          </div>
          <div class="step-actions">
            <label>
              角色卡
              <select
                v-model="selectedCharacterId"
                @change="refreshSelectedCharacter"
              >
                <option
                  v-for="character in availableCharacters"
                  :key="character.id"
                  :value="character.id"
                >
                  {{ character.name }}
                </option>
              </select>
            </label>
            <button
              type="button"
              @click="refreshSelectedCharacter"
            >
              从酒馆重新读取
            </button>
            <button
              type="button"
              @click="createSessionFromContext"
            >
              用刚读取资料开始新会话
            </button>
            <button
              v-if="usingLockedSessionContext"
              type="button"
              @click="useLiveContextForPreview"
            >
              改用刚读取资料
            </button>
          </div>
          <div class="snapshot-grid">
            <article class="snapshot-card">
              <h3>读到的角色 / 用户</h3>
              <dl class="field-list">
                <template
                  v-for="field in characterFields"
                  :key="field[0]"
                >
                  <dt>{{ field[0] }}</dt>
                  <dd>{{ shortText(String(field[1] || ''), 420) }}</dd>
                </template>
              </dl>
            </article>
            <article class="snapshot-card">
              <h3>读到的世界书</h3>
              <div class="source-list">
                <span
                  v-for="book in worldBooks"
                  :key="book.name"
                  class="source-row"
                >
                  <strong>{{ book.name || '未命名世界书' }}</strong>
                  <small>{{ book.entries?.length || 0 }} 条</small>
                </span>
                <p
                  v-if="!worldBooks.length"
                  class="muted"
                >
                  这次准备资料里没有世界书。
                </p>
              </div>
            </article>
          </div>
        </div>

        <div
          v-show="activeWorkspace === 'world'"
          class="panel step-panel"
        >
          <div class="panel-head">
            <div>
              <h2>世界书</h2>
              <p class="muted compact">
                先看小白读到了哪些世界书；本次会带上哪些条目，会由输入决定。
              </p>
            </div>
            <div class="panel-pills">
              <span class="pill">{{ activatedCount }} / {{ worldEntryCount }}</span>
              <span class="pill">{{ worldBudget.enabled ? `${worldBudget.used}/${worldBudget.limit} 字` : '无预算限制' }}</span>
            </div>
          </div>
          <div class="what-to-check">
            <strong>你要判断：</strong>
            <span>该触发的世界书有没有触发；不该触发的有没有混进来；检查结果有没有明显报错。</span>
          </div>
          <div
            v-if="usingLockedSessionContext"
            class="context-warning"
          >
            <strong>世界书来自旧会话快照。</strong>
            <span>如果你刚改了酒馆世界书，这里不会自动变化。点“改用刚读取资料”看最新资料，或回到会话区刷新当前会话资料。</span>
            <button
              type="button"
              @click="useLiveContextForPreview"
            >
              改用刚读取资料
            </button>
          </div>
          <ul class="diagnostics inline-diagnostics">
            <li
              v-for="row in diagnosticRows"
              :key="row"
            >
              {{ row }}
            </li>
          </ul>
          <section class="read-world-section">
            <div class="message-group-head">
              <strong>已经读到的世界书条目</strong>
              <span>{{ worldBookEntryRows.length }} 条</span>
            </div>
            <div class="world-list read-world-list">
              <article
                v-for="entry in worldBookEntryRows"
                :key="entry.key"
                class="world-entry"
              >
                <div class="entry-head">
                  <strong>{{ entry.title }}</strong>
                  <span>{{ entry.bookName }}</span>
                </div>
                <p class="entry-meta">
                  关键词：{{ entry.keywords || '无' }} / 二级关键词：{{ entry.secondaryKeywords || '无' }}
                </p>
                <p>{{ shortText(entry.content, 260) }}</p>
              </article>
              <p
                v-if="!worldBookEntryRows.length"
                class="muted"
              >
                这次没有读到世界书条目。
              </p>
            </div>
          </section>
          <div class="world-debug-grid">
            <details class="debug-box">
              <summary>开发查看：用于匹配世界书的文本 · {{ buildResult.meta.scanTextChars }} 字</summary>
              <pre>{{ shortText(scanTextPreview, 2400) }}</pre>
            </details>
            <div class="debug-box">
              <strong>会放到哪里</strong>
              <div class="position-list">
                <span
                  v-for="row in worldPositionRows"
                  :key="row[0]"
                >
                  {{ insertionTargetLabel(row[0]) }} · {{ row[1] }}
                </span>
                <span v-if="!worldPositionRows.length">这次没有带上世界书</span>
              </div>
            </div>
          </div>
          <div class="message-group-head world-send-head">
            <strong>本次试聊会带上的世界书</strong>
            <span>由输入决定</span>
          </div>
          <div class="world-list">
            <article
              v-for="entry in activatedCandidateRows"
              :key="entry.activationKey"
              class="world-entry"
              :class="{ active: true }"
            >
              <div class="entry-head">
                <strong>{{ entry.title || entry.uid }}</strong>
                <span>{{ statusLabel(entry.status) }}</span>
              </div>
              <small>
                来自 {{ entry.sourceWorldBook || '未归属' }} · 放到 {{ insertionTargetLabel(entry.insertionTarget) }} · {{ entry.contentChars }} 字
              </small>
              <p class="entry-meta">
                关键词：{{ entry.key.join(', ') || '无' }} / 二级关键词：{{ entry.keysecondary.join(', ') || '无' }}
              </p>
              <p class="entry-meta">
                {{ candidateReason(entry) }}
                <template v-if="entry.status === 'budget_skipped' && typeof entry.budgetRemainingBefore === 'number'">
                  · 当时剩余 {{ entry.budgetRemainingBefore }} 字
                </template>
              </p>
              <p>{{ shortText(entry.content, 360) }}</p>
            </article>
            <p
              v-if="!activatedCandidateRows.length"
              class="muted"
            >
              当前输入没有触发世界书条目。
            </p>
          </div>
          <details
            v-if="skippedCandidateRows.length"
            class="raw-json"
          >
            <summary>高级查看：本次不会带上的候选条目 · {{ skippedCandidateRows.length }} 条</summary>
            <div class="world-list folded-world-list">
              <article
                v-for="entry in skippedCandidateRows"
                :key="entry.activationKey"
                class="world-entry"
              >
                <div class="entry-head">
                  <strong>{{ entry.title || entry.uid }}</strong>
                  <span>{{ statusLabel(entry.status) }}</span>
                </div>
                <small>
                  来自 {{ entry.sourceWorldBook || '未归属' }} · {{ entry.contentChars }} 字
                </small>
                <p class="entry-meta">
                  {{ candidateReason(entry) }}
                </p>
              </article>
            </div>
          </details>
        </div>

        <div
          v-show="activeWorkspace === 'messages'"
          class="panel step-panel"
        >
          <div class="panel-head">
            <div>
              <h2>发送内容</h2>
              <p class="muted compact">
                小白会把固定规则、预设、角色卡、世界书、历史和你的本次输入组装成这些内容。
              </p>
            </div>
            <label class="mini-select">
              历史
              <select v-model="historyMode">
                <option value="squash">
                  压缩历史
                </option>
                <option value="raw">
                  逐条历史
                </option>
              </select>
            </label>
          </div>
          <div class="what-to-check">
            <strong>你要判断：</strong>
            <span>最前面必须是小白固定规则；酒馆预设不能混进来；世界书和角色卡应出现在合理位置。</span>
          </div>
          <p class="context-source inline-source">
            <strong>{{ contextSourceTitle }}</strong>
            <span>{{ contextSourceDetail }}</span>
          </p>
          <div class="test-message-preview">
            <strong>本次输入</strong>
            <p>{{ currentUserMessage || '还没填写。' }}</p>
            <button
              type="button"
              @click="activeWorkspace = 'runtime'"
            >
              去试聊页修改
            </button>
          </div>
          <div class="message-preview">
            <section
              v-for="group in messageGroups"
              :key="group.key"
              class="message-group"
            >
              <div class="message-group-head">
                <strong>{{ group.label }}</strong>
                <span>{{ group.rows.length }} 条 · {{ group.chars }} 字 · ~{{ group.tokenEstimate }} tokens</span>
              </div>
              <details
                v-for="row in group.rows"
                :key="`${row.index}-${row.message.role}-${row.layer}`"
                class="message"
                :class="{ linked: row.sourceId && selectedPresetSourceId === row.sourceId }"
                open
              >
                <summary>
                  <span>{{ row.index + 1 }} · {{ roleLabel(row.message.role) }} · {{ row.label }}</span>
                  <small>{{ row.chars }} 字 · ~{{ row.tokenEstimate }} tokens</small>
                </summary>
                <pre>{{ row.message.content }}</pre>
              </details>
            </section>
          </div>
          <details class="raw-json">
            <summary>开发查看：原始 messages</summary>
            <pre>{{ rawMessagesJson }}</pre>
          </details>
        </div>

        <div
          v-show="activeWorkspace === 'runtime'"
          class="panel step-panel"
        >
          <div class="panel-head">
            <div>
              <h2>运行记录</h2>
              <p class="muted compact">
                只跑一轮验证消息结构和模型通道，结果写入小白酒馆自己的会话。
              </p>
            </div>
            <button
              type="button"
              @click="handleChatSubmit"
            >
              {{ isRunning ? '停止' : '运行' }}
            </button>
          </div>
          <div class="what-to-check">
            <strong>你要判断：</strong>
            <span>回复是否像这张角色、是否读到了该读的世界书、是否没有暴露检查内容。</span>
          </div>
          <div
            v-if="usingLockedSessionContext"
            class="context-warning"
          >
            <strong>这次试聊会用旧会话锁定资料。</strong>
            <span>如果你刚改了角色卡或世界书，先点下面按钮改用刚读取资料，或刷新当前会话资料。</span>
            <button
              type="button"
              @click="useLiveContextForPreview"
            >
              改用刚读取资料
            </button>
          </div>
          <div class="run-card">
            <div>
              <strong>怎么试：</strong>
              <ol>
                <li>在下面写一句你要对角色说的话。</li>
                <li>点“运行”。</li>
                <li>看回复像不像这个角色、有没有吃到世界书。</li>
              </ol>
            </div>
            <p class="context-source inline-source">
              <strong>{{ contextSourceTitle }}</strong>
              <span>{{ contextSourceDetail }}</span>
            </p>
          </div>
          <label class="field-label">要发给角色的一句话</label>
          <textarea
            v-model="currentUserMessage"
            class="input"
            rows="3"
          />
          <p
            v-if="runtimeError"
            class="error"
          >
            {{ runtimeError }}
          </p>
          <p
            v-if="runtimeProvider || runtimeModel"
            class="muted"
          >
            模型通道：{{ runtimeProvider || '未知通道' }} / {{ runtimeModel || '未知模型' }}
          </p>
          <p
            v-if="lastRequestSnapshot?.rawMessagesJson"
            class="muted"
          >
            发送内容检查：{{ lastRequestMatchesPreview ? '当前预览和上次实际发送一致' : '当前预览已变化，需要重新试聊' }}
          </p>
          <pre class="runtime">{{ runtimeText || '这里显示 AI 的试跑回复。' }}</pre>
          <details
            v-if="runtimeSnapshotJson"
            class="raw-json"
          >
            <summary>开发查看：本次发送记录</summary>
            <pre>{{ runtimeSnapshotJson }}</pre>
          </details>
          <p class="muted">
            这里只写入小白酒馆自己的会话，不会改动原酒馆聊天。
          </p>
          <div class="session-messages">
            <span
              v-for="message in sessionMessages"
              :key="`${message.sessionId}-${message.order}`"
            >
              {{ message.order + 1 }}. {{ roleLabel(message.role) }}
            </span>
          </div>
        </div>
      </section>
    </section>

    <section
      v-if="activeView === 'settings'"
      class="xb-layout settings-layout"
    >
      <aside class="xb-sidebar settings-sidebar">
        <div class="panel guide-card">
          <h2>设置</h2>
          <div class="guide-steps">
            <button
              type="button"
              class="guide-step"
              :class="{ active: activeSettingsWorkspace === 'api' }"
              @click="activeSettingsWorkspace = 'api'"
            >
              <strong>API 配置</strong>
              <span>模型预设</span>
            </button>
            <button
              type="button"
              class="guide-step"
              :class="{ active: activeSettingsWorkspace === 'preset' }"
              @click="activeSettingsWorkspace = 'preset'"
            >
              <strong>小白预设</strong>
              <span>规则</span>
            </button>
          </div>
        </div>
      </aside>

      <section class="xb-main">
        <div
          v-show="activeSettingsWorkspace === 'api'"
          class="panel step-panel api-workspace"
        >
          <div class="panel-head">
            <div>
              <h2>API 配置</h2>
              <p class="muted compact">
                小白酒馆使用小白助手和电纸书同一套模型预设；保存后会立刻用于后续聊天。
              </p>
            </div>
            <span
              class="pill"
              :class="{ warning: !apiReady }"
            >
              {{ apiReady ? '可发模' : '需配置' }}
            </span>
          </div>
          <div
            class="what-to-check"
            :class="{ warning: !apiReady }"
          >
            <strong>当前模型：</strong>
            <span>{{ apiReady ? apiRuntimeLine : apiReadyDetail }}</span>
          </div>
          <div
            ref="apiSettingsRootRef"
            class="tavern-api-settings"
          />
        </div>

        <div
          v-show="activeSettingsWorkspace === 'preset'"
          class="panel step-panel preset-workspace"
        >
          <div class="panel-head drawer-head">
            <div>
              <h2>调整小白预设</h2>
              <p class="muted compact">
                这里会影响最终发给模型的内容。默认规则不能直接改，需要先复制一份。
              </p>
            </div>
            <div class="panel-pills">
              <span
                v-if="presetDirty"
                class="pill warning"
              >未保存</span>
              <span class="pill">{{ preset.version }} · {{ preset.id }}</span>
            </div>
          </div>
          <div class="preset-toolbar">
            <select
              v-model="activePresetId"
              @change="selectPreset(activePresetId)"
            >
              <option :value="DEFAULT_XB_TAVERN_PRESET_ID">
                默认规则（不能直接改）
              </option>
              <option
                v-for="item in userPresets"
                :key="item.id"
                :value="item.id"
              >
                {{ item.name }}
              </option>
            </select>
            <button
              type="button"
              @click="deriveDefaultPreset"
            >
              复制一份来改
            </button>
            <button
              type="button"
              :disabled="presetIsBuiltIn"
              @click="saveCurrentPreset"
            >
              保存规则
            </button>
            <button
              type="button"
              :disabled="!presetDirty"
              @click="discardPresetChanges"
            >
              放弃改动
            </button>
            <button
              type="button"
              @click="resetToBuiltInPreset"
            >
              用回默认
            </button>
          </div>
          <p
            v-if="presetStatus"
            class="muted compact"
          >
            {{ presetStatus }}
          </p>
          <p class="muted">
            {{ preset.description }}
          </p>
          <div class="preset-editor">
            <label>
              名称
              <input
                :value="preset.name"
                :disabled="presetIsBuiltIn"
                @input="updatePresetMeta({ name: ($event.target as HTMLInputElement).value })"
              >
            </label>
            <label>
              描述
              <textarea
                :value="preset.description"
                :disabled="presetIsBuiltIn"
                rows="2"
                @input="updatePresetMeta({ description: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label>
              最高优先级规则
              <textarea
                :value="preset.systemPrompt"
                :disabled="presetIsBuiltIn"
                rows="4"
                @input="updatePresetMeta({ systemPrompt: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label>
              工具和行为边界
              <textarea
                :value="preset.toolPrompt"
                :disabled="presetIsBuiltIn"
                rows="3"
                @input="updatePresetMeta({ toolPrompt: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
          </div>
          <div class="preset-editor-head">
            <strong>可插入的补充规则</strong>
            <button
              type="button"
              :disabled="presetIsBuiltIn"
              @click="addPresetSection"
            >
              新增规则段
            </button>
          </div>
          <div class="preset-section-editor">
            <article
              v-for="(section, index) in preset.sections || []"
              :key="section.id || index"
              class="preset-edit-card"
              :class="{
                disabled: section.enabled === false,
                selected: selectedPresetSourceId === section.id,
              }"
              @click="selectedPresetSourceId = section.id || ''"
            >
              <div class="preset-card-head">
                <label class="inline-check">
                  <input
                    type="checkbox"
                    :checked="section.enabled !== false"
                    :disabled="presetIsBuiltIn"
                    @change="updatePresetSection(index, { enabled: ($event.target as HTMLInputElement).checked })"
                  >
                  启用
                </label>
                <span class="muted compact">
                  {{ section.locked === false ? '可变段' : '锁定段' }}
                </span>
                <div class="row-actions">
                  <button
                    type="button"
                    :disabled="presetIsBuiltIn || index === 0"
                    @click.stop="movePresetSection(index, -1)"
                  >
                    上移
                  </button>
                  <button
                    type="button"
                    :disabled="presetIsBuiltIn || index === (preset.sections || []).length - 1"
                    @click.stop="movePresetSection(index, 1)"
                  >
                    下移
                  </button>
                </div>
              </div>
              <div class="preset-edit-grid">
                <label>
                  标签
                  <input
                    :value="section.label"
                    :disabled="presetIsBuiltIn"
                    @input="updatePresetSection(index, { label: ($event.target as HTMLInputElement).value })"
                  >
                </label>
                <label>
                  消息身份
                  <select
                    :value="section.role || 'system'"
                    :disabled="presetIsBuiltIn"
                    @change="updatePresetSection(index, { role: ($event.target as HTMLSelectElement).value })"
                  >
                    <option value="system">
                      规则消息
                    </option>
                    <option value="user">
                      用户消息
                    </option>
                    <option value="assistant">
                      AI 消息
                    </option>
                  </select>
                </label>
                <label>
                  放入位置
                  <select
                    :value="section.placement || 'beforeHistory'"
                    :disabled="presetIsBuiltIn"
                    @change="updatePresetSection(index, { placement: ($event.target as HTMLSelectElement).value as XbTavernPresetSection['placement'] })"
                  >
                    <option value="top">
                      最前面
                    </option>
                    <option value="beforeCharacter">
                      角色卡之前
                    </option>
                    <option value="afterCharacter">
                      角色卡之后
                    </option>
                    <option value="beforeHistory">
                      历史之前
                    </option>
                    <option value="afterHistory">
                      历史之后
                    </option>
                    <option value="assistantPrefill">
                      回复开头
                    </option>
                  </select>
                </label>
                <button
                  type="button"
                  :disabled="presetIsBuiltIn"
                  @click.stop="removePresetSection(index)"
                >
                  删除
                </button>
              </div>
              <textarea
                :value="section.content"
                :disabled="presetIsBuiltIn"
                rows="4"
                @input="updatePresetSection(index, { content: ($event.target as HTMLTextAreaElement).value })"
              />
            </article>
          </div>
          <div class="preset-list">
            <details
              v-for="row in presetRows"
              :key="row.previewId"
              class="preset-section"
              :class="{
                disabled: row.enabled === false,
                selected: selectedPresetSourceId === row.previewId,
              }"
              @click="selectedPresetSourceId = row.previewId"
            >
              <summary>
                <span>{{ row.previewPlacement }} · {{ row.previewLabel }}</span>
                <small>{{ row.enabled === false ? '停用' : '启用' }} · {{ row.locked === false ? '可变' : '锁定' }} · {{ row.chars }} 字</small>
              </summary>
              <pre>{{ row.content }}</pre>
            </details>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>
