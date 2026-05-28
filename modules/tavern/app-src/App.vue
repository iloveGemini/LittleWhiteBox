<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
    buildXbTavernMessages,
    createXbTavernBuildSnapshot,
    type XbTavernContext,
    type XbTavernMessage,
    type XbTavernPresetSection,
} from '../shared/message-assembler';
import { createDefaultXbTavernPreset, DEFAULT_XB_TAVERN_PRESET_ID } from '../shared/presets';
import {
    appendTavernMessage,
    createTavernSession,
    deriveAndActivateDefaultTavernPreset,
    getActiveTavernPresetId,
    getSelectedTavernSessionId,
    loadActiveTavernPreset,
    listTavernMessages,
    listTavernSessions,
    listUserTavernPresets,
    normalizeTavernSessionState,
    saveTavernPreset,
    setActiveTavernPresetId,
    setSelectedTavernSessionId,
    updateTavernSessionState,
    type TavernMessageRecord,
    type TavernPresetRecord,
    type TavernSessionRecord,
} from '../shared/session-db';
import { runTavernOnce } from './runtime/run-once';

interface TavernDiagnostics {
    ok?: boolean;
    message?: string;
    worldbookErrors?: Array<{ name: string; error: string }>;
}

const SOURCE_APP = 'xb-tavern-app';
const SOURCE_HOST = 'xb-tavern-host';

const context = ref<XbTavernContext>({});
const diagnostics = ref<TavernDiagnostics>({});
const agentConfig = ref<Record<string, unknown>>({});
const availableCharacters = ref<Array<{ id: string; name: string; avatar?: string }>>([]);
const selectedCharacterId = ref('');
const statusText = ref('等待读取资料');
const currentUserMessage = ref('测试一句角色回复。');
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
const preset = ref(createDefaultXbTavernPreset());
const userPresets = ref<TavernPresetRecord[]>([]);
const activePresetId = ref(DEFAULT_XB_TAVERN_PRESET_ID);
const presetStatus = ref('');
const savedPresetJson = ref('');
const selectedPresetSourceId = ref('');
const presetIsBuiltIn = computed(() => activePresetId.value === DEFAULT_XB_TAVERN_PRESET_ID);
const presetDirty = computed(() => !presetIsBuiltIn.value && snapshotPreset(preset.value) !== savedPresetJson.value);
const selectedSession = computed(() => sessions.value.find((item) => item.id === selectedSessionId.value) || null);
const sessionRuntimeState = computed(() => normalizeTavernSessionState(selectedSession.value?.state || {}));
const activeWorkspace = ref<'overview' | 'snapshot' | 'preset' | 'world' | 'messages' | 'runtime'>('overview');
const workspaceTabs = [
    { key: 'overview', label: '总览', hint: '现在选了谁，准备到哪一步' },
    { key: 'snapshot', label: '资料来源', hint: '这次会用哪些角色和世界资料' },
    { key: 'preset', label: '说话规则', hint: '小白会怎样约束 AI 扮演' },
    { key: 'world', label: '世界书命中', hint: '哪些世界书会被带上' },
    { key: 'messages', label: '发送内容', hint: '真正发给 AI 的内容' },
    { key: 'runtime', label: '试一句', hint: '用当前配置试跑一轮' },
] as const;
const activeWorkspaceItem = computed(() => workspaceTabs.find((item) => item.key === activeWorkspace.value) || workspaceTabs[0]);

const effectiveContext = computed<XbTavernContext>(() => ({
    ...(selectedSession.value?.contextSnapshot || context.value),
    history: selectedSessionId.value
        ? sessionMessages.value.map((message) => ({
            role: ['system', 'user', 'assistant', 'tool'].includes(message.role) ? message.role as XbTavernMessage['role'] : 'assistant',
            content: message.content,
            name: message.name,
        }))
        : context.value.history,
}));

const buildResult = computed(() => buildXbTavernMessages(effectiveContext.value, preset.value, {
    currentUserMessage: currentUserMessage.value,
    historyMode: historyMode.value,
    worldSettings: {
        recursion: true,
        recursionLimit: 4,
        budgetChars: 24000,
        turn: sessionRuntimeState.value.turn,
        entryStates: sessionRuntimeState.value.worldEntryStates,
    },
}));

const characterName = computed(() => context.value.character?.name || '未选择角色');
const userName = computed(() => context.value.user?.name || 'User');
const worldBooks = computed(() => context.value.worldBooks || []);
const worldBookCount = computed(() => worldBooks.value.length);
const worldEntryCount = computed(() => buildResult.value.worldEntryCandidates.length);
const activatedCount = computed(() => buildResult.value.activatedWorldEntries.length);
const messagePreview = computed(() => buildResult.value.messages);
const selectedSessionTitle = computed(() => selectedSession.value?.title || '未创建会话');
const rawMessagesJson = computed(() => buildResult.value.meta.rawMessagesJson);
const buildSnapshot = computed(() => createXbTavernBuildSnapshot(effectiveContext.value, preset.value, buildResult.value, diagnostics.value));

const characterFields = computed(() => {
    const character = context.value.character || {};
    const user = context.value.user || {};
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
        diagnostics.value.message || statusText.value,
        characterName.value ? '' : '当前没有可用角色卡。',
        (context.value.history || []).length ? '' : '这次准备资料里没有聊天历史。',
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

const activeCandidateKeys = computed(() => new Set(buildResult.value.activatedWorldEntries.map((entry) => entry.activationKey)));
const activatedOrder = computed(() => new Map(buildResult.value.activatedWorldEntries.map((entry, index) => [entry.activationKey, index])));
const candidateRows = computed(() => buildResult.value.worldEntryCandidates);
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

function postToHost(type: string, payload: Record<string, unknown> = {}) {
    window.parent?.postMessage({ source: SOURCE_APP, type, payload }, window.location.origin);
}

function applyHostPayload(payload: Record<string, unknown>) {
    context.value = payload.context as XbTavernContext || {};
    diagnostics.value = payload.diagnostics as TavernDiagnostics || {};
    agentConfig.value = payload.agentConfig as Record<string, unknown> || agentConfig.value;
    availableCharacters.value = payload.availableCharacters as Array<{ id: string; name: string; avatar?: string }> || availableCharacters.value;
    selectedCharacterId.value = String(payload.selectedCharacterId || context.value.character?.id || selectedCharacterId.value || '');
    statusText.value = diagnostics.value.message || '宿主资料已加载';
}

function onHostMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin) {return;}
    const data = event.data || {};
    if (data.source !== SOURCE_HOST) {return;}
    if (data.type === 'xb-tavern:config') {
        applyHostPayload(data.payload || {});
        return;
    }
    if (data.type === 'xb-tavern:context') {
        applyHostPayload(data.payload || {});
    }
}

function refreshSelectedCharacter() {
    statusText.value = '正在重新读取这张角色卡';
    postToHost('xb-tavern:refresh-context', {
        characterId: selectedCharacterId.value,
    });
}

async function refreshSessions() {
    sessions.value = await listTavernSessions();
    selectedSessionId.value = await getSelectedTavernSessionId();
    if (!selectedSessionId.value && sessions.value[0]) {
        selectedSessionId.value = sessions.value[0].id;
        await setSelectedTavernSessionId(selectedSessionId.value);
    }
    sessionMessages.value = selectedSessionId.value ? await listTavernMessages(selectedSessionId.value) : [];
}

async function createSessionFromContext() {
    const snapshotContext = context.value;
    const snapshotBuildResult = buildXbTavernMessages(snapshotContext, preset.value, {
        currentUserMessage: currentUserMessage.value,
        historyMode: historyMode.value,
        worldSettings: {
            recursion: true,
            recursionLimit: 4,
            budgetChars: 24000,
            turn: 0,
            entryStates: {},
        },
    });
    const snapshotBuild = createXbTavernBuildSnapshot(snapshotContext, preset.value, snapshotBuildResult, diagnostics.value);
    const session = await createTavernSession({
        title: `${snapshotContext.character?.name || '未选择角色'} · 小白酒馆`,
        characterId: String(snapshotContext.character?.id || ''),
        characterName: String(snapshotContext.character?.name || '未选择角色'),
        contextSnapshot: snapshotContext,
        buildSnapshot: snapshotBuild,
        presetId: String(preset.value.id || activePresetId.value || ''),
        presetName: String(preset.value.name || ''),
        state: {
            turn: 0,
            worldEntryStates: {},
        },
    });
    selectedSessionId.value = session.id;
    await refreshSessions();
}

async function selectSession(sessionId: string) {
    selectedSessionId.value = sessionId;
    await setSelectedTavernSessionId(sessionId);
    sessionMessages.value = await listTavernMessages(sessionId);
}

async function ensureSession(snapshot?: {
    context: XbTavernContext;
    buildSnapshot: ReturnType<typeof createXbTavernBuildSnapshot>;
    presetId: string;
    presetName: string;
}): Promise<string> {
    if (!selectedSessionId.value) {
        const snapshotContext = snapshot?.context || context.value;
        const session = await createTavernSession({
            title: `${snapshotContext.character?.name || '未选择角色'} · 小白酒馆`,
            characterId: String(snapshotContext.character?.id || ''),
            characterName: String(snapshotContext.character?.name || '未选择角色'),
            contextSnapshot: snapshotContext,
            buildSnapshot: snapshot?.buildSnapshot,
            presetId: snapshot?.presetId || String(preset.value.id || activePresetId.value || ''),
            presetName: snapshot?.presetName || String(preset.value.name || ''),
            state: {
                turn: 0,
                worldEntryStates: {},
            },
        });
        selectedSessionId.value = session.id;
        await refreshSessions();
    }
    return selectedSessionId.value;
}

function shortText(value = '', limit = 180) {
    const text = String(value || '').trim();
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function statusLabel(status = '') {
    const labels: Record<string, string> = {
        activated: '已激活',
        budget_skipped: '预算跳过',
        not_matched: '未命中',
        secondary_not_matched: '二级未命中',
        disabled: '已禁用',
        suppressed_by_decorator: '装饰器抑制',
        cooldown: '冷却中',
        delay: '延迟中',
        probability_failed: '概率未通过',
    };
    return labels[status] || status || '未知';
}

function candidateReason(entry: { status?: string; activationReason?: string; budgetShortfall?: number; budgetRemainingBefore?: number }) {
    if (entry.status === 'activated') {
        return entry.activationReason ? `命中：${entry.activationReason}` : '已激活';
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

async function runOnce() {
    const requestContext = effectiveContext.value;
    const requestPresetId = String(preset.value.id || activePresetId.value || '');
    const requestPresetName = String(preset.value.name || '');
    const requestRuntimeState = normalizeTavernSessionState(selectedSession.value?.state || {});
    const requestBuildResult = buildXbTavernMessages(requestContext, preset.value, {
        currentUserMessage: currentUserMessage.value,
        historyMode: historyMode.value,
        worldSettings: {
            recursion: true,
            recursionLimit: 4,
            budgetChars: 24000,
            turn: requestRuntimeState.turn,
            entryStates: requestRuntimeState.worldEntryStates,
        },
    });
    const requestBuildSnapshot = createXbTavernBuildSnapshot(requestContext, preset.value, requestBuildResult, diagnostics.value);
    const requestRawMessagesJson = requestBuildResult.meta.rawMessagesJson;
    runtimeError.value = '';
    runtimeText.value = '';
    runtimeProvider.value = '';
    runtimeModel.value = '';
    runtimeSnapshotJson.value = JSON.stringify({
        buildSnapshot: requestBuildSnapshot,
    }, null, 2);
    isRunning.value = true;
    try {
        const sessionId = await ensureSession({
            context: requestContext,
            buildSnapshot: requestBuildSnapshot,
            presetId: requestPresetId,
            presetName: requestPresetName,
        });
        await appendTavernMessage(sessionId, {
            role: 'user',
            content: currentUserMessage.value,
            contextSnapshot: requestContext,
            buildSnapshot: requestBuildSnapshot,
            presetId: requestPresetId,
            presetName: requestPresetName,
        });
        const result = await runTavernOnce({
            agentConfig: agentConfig.value,
            messages: requestBuildResult.messages,
            onStreamProgress: (snapshot) => {
                if (typeof snapshot.text === 'string') {runtimeText.value = snapshot.text;}
            },
        });
        runtimeText.value = result.text;
        runtimeProvider.value = result.provider || '';
        runtimeModel.value = result.model || '';
        await appendTavernMessage(sessionId, {
            role: 'assistant',
            content: result.text,
            providerPayload: result.providerPayload,
            contextSnapshot: requestContext,
            buildSnapshot: requestBuildSnapshot,
            presetId: requestPresetId,
            presetName: requestPresetName,
            requestSnapshot: result.requestSnapshot,
        });
        await updateTavernSessionState(sessionId, {
            turn: Number(requestRuntimeState.turn || 0) + 1,
            worldEntryStates: requestBuildResult.meta.worldEntryStateUpdates,
            lastBuildSnapshot: requestBuildSnapshot,
            lastRequestSnapshot: result.requestSnapshot,
            lastProvider: result.provider || '',
            lastModel: result.model || '',
        });
        runtimeSnapshotJson.value = JSON.stringify({
            provider: result.provider || '',
            model: result.model || '',
            previewMatchesRequest: requestRawMessagesJson === result.requestSnapshot.rawMessagesJson,
            nextTurn: Number(requestRuntimeState.turn || 0) + 1,
            buildSnapshot: requestBuildSnapshot,
            requestSnapshot: result.requestSnapshot,
        }, null, 2);
        await refreshSessions();
    } catch (error) {
        runtimeError.value = error instanceof Error ? error.message : String(error || 'run_failed');
    } finally {
        isRunning.value = false;
    }
}

onMounted(async () => {
    // onHostMessage validates origin and message source before accepting payloads.
    // eslint-disable-next-line no-restricted-syntax
    window.addEventListener('message', onHostMessage);
    await refreshPresets();
    await refreshSessions();
    postToHost('xb-tavern:frame-ready');
});

onUnmounted(() => {
    window.removeEventListener('message', onHostMessage);
});
</script>

<template>
  <main class="xb-tavern">
    <header class="xb-topbar">
      <div>
        <p class="eyebrow">
          LittleWhiteBox Tavern
        </p>
        <h1>小白酒馆准备页</h1>
      </div>
      <button
        class="icon-button"
        type="button"
        title="关闭"
        @click="postToHost('xb-tavern:close')"
      >
        ×
      </button>
    </header>

    <section class="xb-layout">
      <aside class="xb-sidebar">
        <div class="panel">
          <h2>选择资料</h2>
          <dl class="kv">
            <dt>角色</dt>
            <dd>{{ characterName }}</dd>
            <dt>用户</dt>
            <dd>{{ userName }}</dd>
            <dt>世界书</dt>
            <dd>{{ worldBookCount }} 本 / {{ worldEntryCount }} 条</dd>
            <dt>会带上</dt>
            <dd>{{ activatedCount }} 条</dd>
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
            重新读取资料
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
            用当前资料开始新会话
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
              <h2>先看这里</h2>
              <p class="muted compact">
                按顺序确认资料、规则、世界书和发送内容，最后试跑一句。
              </p>
            </div>
            <span class="pill">
              正在看：{{ activeWorkspaceItem.label }}
            </span>
          </div>
          <div class="workspace-tabs">
            <button
              v-for="tab in workspaceTabs"
              :key="tab.key"
              type="button"
              class="workspace-tab"
              :class="{ active: activeWorkspace === tab.key }"
              @click="activeWorkspace = tab.key"
            >
              <strong>{{ tab.label }}</strong>
              <small>{{ tab.hint }}</small>
            </button>
          </div>
        </div>

        <div
          v-show="activeWorkspace === 'overview'"
          class="panel overview-panel"
        >
          <div class="panel-head">
            <div>
              <h2>现在这套配置会怎么工作</h2>
              <p class="muted compact">
                小白会用左侧选中的角色和会话，按自己的规则组装一份内容发给 AI。
              </p>
            </div>
          </div>
          <div class="overview-steps">
            <button
              type="button"
              @click="activeWorkspace = 'snapshot'"
            >
              <strong>1. 看资料</strong>
              <span>{{ characterName }} · 世界书 {{ worldBookCount }} 本 · 历史 {{ context.history?.length || 0 }} 条</span>
            </button>
            <button
              type="button"
              @click="activeWorkspace = 'preset'"
            >
              <strong>2. 看规则</strong>
              <span>{{ preset.name || '默认规则' }} · {{ presetRows.length }} 段</span>
            </button>
            <button
              type="button"
              @click="activeWorkspace = 'world'"
            >
              <strong>3. 看世界书</strong>
              <span>本轮会带上 {{ activatedCount }} 条，可检查 {{ worldEntryCount }} 条</span>
            </button>
            <button
              type="button"
              @click="activeWorkspace = 'messages'"
            >
              <strong>4. 看发送内容</strong>
              <span>{{ messagePreview.length }} 条内容 · {{ buildSnapshot.messageChars }} 字</span>
            </button>
            <button
              type="button"
              @click="activeWorkspace = 'runtime'"
            >
              <strong>5. 试一句</strong>
              <span>{{ selectedSessionTitle }}</span>
            </button>
          </div>
        </div>

        <div
          v-show="activeWorkspace === 'snapshot'"
          class="panel"
        >
          <div class="panel-head">
            <h2>本次会用的资料</h2>
            <span class="pill">历史 {{ context.history?.length || 0 }} 条</span>
          </div>
          <div class="snapshot-grid">
            <article class="snapshot-card">
              <h3>角色 / 用户</h3>
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
              <h3>世界书来源</h3>
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
          v-show="activeWorkspace === 'preset'"
          class="panel"
        >
          <div class="panel-head">
            <div>
              <h2>小白自己的说话规则</h2>
              <p class="muted compact">
                {{ preset.name }} · {{ preset.version }} · {{ preset.id }}
              </p>
            </div>
            <div class="panel-pills">
              <span
                v-if="presetDirty"
                class="pill warning"
              >未保存</span>
              <span class="pill">{{ presetRows.length }} 段</span>
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

        <div
          v-show="activeWorkspace === 'world'"
          class="panel"
        >
          <div class="panel-head">
            <h2>这次会带上的世界书</h2>
            <div class="panel-pills">
              <span class="pill">{{ activatedCount }} / {{ worldEntryCount }}</span>
              <span class="pill">{{ worldBudget.enabled ? `${worldBudget.used}/${worldBudget.limit} 字` : '无预算限制' }}</span>
            </div>
          </div>
          <div class="world-debug-grid">
            <details class="debug-box">
              <summary>用于匹配世界书的文本 · {{ buildResult.meta.scanTextChars }} 字</summary>
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
          <div class="world-list">
            <article
              v-for="entry in [...activatedCandidateRows, ...skippedCandidateRows]"
              :key="entry.activationKey"
              class="world-entry"
              :class="{ active: activeCandidateKeys.has(entry.activationKey) }"
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
              v-if="!candidateRows.length"
              class="muted"
            >
              当前没有可检查的世界书条目。
            </p>
          </div>
        </div>

        <div
          v-show="activeWorkspace === 'messages'"
          class="panel"
        >
          <div class="panel-head">
            <h2>真正发给 AI 的内容</h2>
            <select v-model="historyMode">
              <option value="squash">
                压缩历史
              </option>
              <option value="raw">
                逐条历史
              </option>
            </select>
          </div>
          <textarea
            v-model="currentUserMessage"
            class="input"
            rows="3"
          />
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
            <summary>技术明细：原始发送内容</summary>
            <pre>{{ rawMessagesJson }}</pre>
          </details>
        </div>

        <div
          v-show="activeWorkspace === 'runtime'"
          class="panel"
        >
          <div class="panel-head">
            <h2>试跑一轮</h2>
            <button
              type="button"
              :disabled="isRunning"
              @click="runOnce"
            >
              {{ isRunning ? '运行中' : '试发给 AI' }}
            </button>
          </div>
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
          <pre class="runtime">{{ runtimeText || '这里显示 AI 的试跑回复。' }}</pre>
          <details
            v-if="runtimeSnapshotJson"
            class="raw-json"
          >
            <summary>技术明细：本次发送记录</summary>
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
  </main>
</template>
