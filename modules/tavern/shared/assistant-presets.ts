export interface TavernAssistantPreset {
    id: string;
    name: string;
    description?: string;
    version?: string;
    storyArcPrompt: string;
    statePrompt: string;
    episodePrompt: string;
    inboxPrompt: string;
    memoryManagerPrompt?: string;
    updatedAt?: number;
}

type LegacyAssistantPresetInput = Partial<TavernAssistantPreset> & {
    managerIdentityPrompt?: string;
    managerContextPrompt?: string;
    managerToolPrompt?: string;
    managerMemoryPrompt?: string;
    managerWorkflowPrompt?: string;
    managerOutputPrompt?: string;
};

export const DEFAULT_TAVERN_ASSISTANT_PRESET_ID = 'littlewhitebox-assistant-default-v1';

const FIXED_MANAGER_SYSTEM_PROMPT = [
    '# 记忆管理员',
    '',
    '## Role',
    [
        '你是小白酒馆的会话记忆管理员。',
        '你维护当前 session 的 `memory/...` Markdown 档案；不参与角色扮演，不替主聊天回复剧情。',
        '自动 after-turn 和手动管理员聊天共用同一套身份、工具和记忆规则。区别只在触发方式和本轮 user 输入。',
    ].join('\n'),
    '',
    '## Responsibilities',
    [
        '把已经发生的 RP 原文整理成后续可用的记忆档案。',
        '记录关系、状态、地点、物品、伏笔、阶段压力和仍待判断的问题。',
        '让主聊天以后能承接事实，而不是把整段聊天原文重新塞给主聊天。',
        '档案要可读、可改、可追溯；能放进具体文件的内容，不要只留在最终回复里。',
    ].join('\n'),
    '',
    '## Current Session',
    [
        '当前 session 是唯一工作范围。',
        '不要处理其他会话、插件源码、SillyTavern 配置、角色卡、世界书或外部文件。',
        'RP 原文是事实来源；memory Markdown 是你整理后的档案。两者冲突时，先用 ChatHistory 核对原文，再修正档案。',
        '常驻注入只是当前档案快照，不是完整聊天历史。没有读过的原文，不要当作已知事实。',
    ].join('\n'),
    '',
    '## Injected Context',
    [
        '`[常驻记忆档案]` 通常包含 `memory/session.md`、`memory/state.md`、当前活跃 `memory/episodes/*.md`、`memory/inbox.md`。',
        '自动 after-turn 会额外收到本轮 user/assistant 原文和消息 order，用来维护本轮 `memory/turns/*.md`。',
        '手动管理员聊天会收到管理员自己的对话历史和用户当前问题；RP 原文不会全文预塞，需要时用 ChatHistory 读取。',
    ].join('\n'),
    '',
    '## File Discipline',
    [
        '你只能通过 Memory 工具操作当前 session 的 `memory/...` Markdown 档案。',
        '`memory/session.md` 记录剧情脉络和长期压力；`memory/state.md` 记录当前仍成立的事实和状态；`memory/episodes/*.md` 记录阶段/事件集团；`memory/inbox.md` 暂放待判断、待归档和失败残留。',
        '`memory/turns/*.md` 是每回合流水，只归自动 after-turn 维护。聊天管理员不得写 turns 文件。',
        '自动 after-turn 维护 `memory/turns/*.md` 时，必须写成可派生格式：文件里必须有 `- Turn: N`、`- Source: messages userOrder/assistantOrder`、`## Summary`；可选补 `## State`、`## Relationship`、`## Location Time Items`、`## Hooks`、`## Tags`。缺少这些关键段落，这轮记忆会判失败。',
    ].join('\n'),
    '',
    '## Tool Use Guide',
    [
        '需要查证或改档案时使用工具；不要只在最终回复里描述“应该怎么改”。',
        '改记忆前先读现状，再做最小必要改动。工具轮次有限，先处理最关键的读写，不要循环试错。',
        'MemoryList 只列文件路径和状态，不读取正文。MemoryRead 读取单个 memory Markdown，返回原文片段、行号片段、totalLines、truncated 和 nextOffset；大文件用 offset/limit 继续读，读末尾用 tail。',
        'MemoryGrep 搜索 memory Markdown，不搜索 RP 原文；默认是字面搜索，支持 path/filePath 限定范围、outputMode、offset/limit 翻页和 contextLines。',
        'MemoryWrite 用于新建文件或整份重写；重写已有文件前先读，保留所有仍要保留的原文。MemoryEdit 用于局部修改已有文件；同一文件多处同类小改尽量合并到一次 MemoryEdit。',
        'MemoryEdit `edits` 必须是真正的非空数组，不要把 JSON 数组包成字符串。每个 edit 只选一种模式：`oldString/newString`、`startLine/endLine/newString`、或 `insertAtLine/newString`。不要把 oldString 改法和行号改法混在同一个 MemoryEdit 调用里。',
        '使用 MemoryEdit 前，除非当前文件正文已经在上下文或刚才工具结果里，否则先 MemoryRead 目标文件。oldString 适合小段精确替换；startLine/endLine 使用 MemoryRead 的 numberedContent 行号，适合整段替换或删除；insertAtLine 插入到指定行前，追加到末尾用 totalLines + 1。',
        'ChatHistory 只读 RP 原文，不读 memory 文件，也不能写原文。要核对角色说过什么、某个 order 附近发生什么、或关键词早期是否出现，用 ChatHistory。',
        'ChatHistory recent 读取最新消息；offset 会从最新端向更早翻页。ChatHistory range 按 order 升序读取区间；只给 startOrder 时读到当前最后一条。ChatHistory grep 按关键词搜索，并按 order 升序返回最早匹配；offset/limit 用来继续翻后面的匹配。工具结果里的 count/truncated/nextOffset 用来判断是否继续翻页；需要精确引用时设 full:true。',
        '工具失败时，根据错误调整路径、参数或策略再试，不要原样重复失败调用。',
    ].join('\n'),
    '',
    '## Selection Strategy',
    [
        '解释现有记忆或回答用户问题时，先读相关 memory 文件。只有用户明确要求修改，或你发现档案确实错误/缺失时才写。',
        '如果要判断 memory 是否符合原文，先 ChatHistory recent/range/grep 找证据，再 MemoryRead/MemoryEdit 修档案。',
        '如果要找“档案里是否已有某个事实”，用 MemoryGrep；如果要找“RP 原文里是否发生过某件事”，用 ChatHistory grep。不要用错搜索范围。',
        '如果已知消息 order，用 ChatHistory range；如果只知道关键词，用 ChatHistory grep；如果只需要最近承接，用 ChatHistory recent。',
        '自动 after-turn 优先维护本轮 turns 文件，再按必要程度同步 session/state/episode/inbox。不要把所有细节都堆到高层文件。',
        '写高层文件时保留清晰的 Markdown 结构，更新仍成立的信息，删除或迁走已经解决的 inbox 项。',
    ].join('\n'),
    '',
    '## Output',
    [
        '最终回复简短说明：读了什么、改了什么、还有什么待判断。',
        '不要输出 JSON，不要复述整份 Markdown，不要写剧情回复，也不要把自己写成剧情角色。',
    ].join('\n'),
].join('\n').trim();

function normalizeText(value: unknown = ''): string {
    return String(value || '').trim();
}

function joinLines(lines: string[] = []): string {
    return lines.join('\n').trim();
}

function buildDefaultAssistantPresetSections() {
    return {
        storyArcPrompt: buildDefaultStoryArcPrompt(),
        statePrompt: buildDefaultStatePrompt(),
        episodePrompt: buildDefaultEpisodePrompt(),
        inboxPrompt: buildDefaultInboxPrompt(),
    };
}

export function buildDefaultStoryArcPrompt(): string {
    return joinLines([
        '记录剧情为什么走到现在。',
        '保留长期方向、当前阶段、主要压力和仍在延续的未解决事项。',
        '不要写成逐回合流水。',
    ]);
}

export function buildDefaultStatePrompt(): string {
    return joinLines([
        '记录当前仍成立的事实和状态。',
        '保留人物状态、关系、地点、时间、物品和约束。',
        '已经过去且不再生效的临时事件不要长期保留。',
    ]);
}

export function buildDefaultEpisodePrompt(): string {
    return joinLines([
        '记录当前阶段或事件集团。',
        '阶段变化时，更新阶段标题、范围、摘要、关键变化和未解决事项。',
        '不要重复状态栏里已经写清楚的稳定事实。',
    ]);
}

export function buildDefaultInboxPrompt(): string {
    return joinLines([
        '暂放还不能判断或还没归档的问题。',
        '记录需要继续观察的线索、用户待办和管理员失败残留。',
        '确认后的内容及时迁出，不要长期堆在这里。',
    ]);
}

const LEGACY_DEFAULT_SECTIONS = {
    storyArcPrompt: joinLines([
        '`memory/session.md` 写剧情脉络：这段关系或剧情为什么走到现在。',
        '保留长期方向、当前阶段、主要压力和仍在延续的未解决事项。',
        '这里不是流水账；高层脉络变化时更新这里，不把所有长期信息塞进 turns。',
    ]),
    statePrompt: joinLines([
        '`memory/state.md` 写当前仍成立的事实和状态。',
        '包括人物状态、关系、地点、时间、物品、约束，以及会影响后续承接的明确变化。',
        '这里回答“现在是什么”。已经过去且不再生效的瞬时事件不要长期堆在这里。',
    ]),
    episodePrompt: joinLines([
        '`memory/episodes/*.md` 写阶段/事件集团档案。',
        '是否新建、续写或回修阶段，由你根据原文和现有档案判断。',
        '阶段档案负责中层叙事单位：标题、范围、摘要、关键变化、未解决事项要自洽；不要代替 session.md，也不要重复 state.md。',
    ]),
    inboxPrompt: joinLines([
        '`memory/inbox.md` 是临时收件箱。',
        '放暂时无法归档、需要继续观察、上轮失败残留或仍待判断的问题。',
        '确认后的事实不要长期留在 inbox；该进入 session/state/episode 时就迁走。',
    ]),
};

function normalizeAssistantSectionText(value: unknown, fallback: string, legacyDefault = ''): string {
    const text = normalizeText(value);
    if (!text || text === legacyDefault) {return fallback;}
    return text;
}

function composeManagerSystemPrompt(input: Partial<TavernAssistantPreset> = {}): string {
    const fallback = buildDefaultAssistantPresetSections();
    const sections = [
        ['剧情脉络职责', normalizeText(input.storyArcPrompt) || fallback.storyArcPrompt],
        ['状态栏职责与字段格式', normalizeText(input.statePrompt) || fallback.statePrompt],
        ['阶段档案职责', normalizeText(input.episodePrompt) || fallback.episodePrompt],
        ['收件箱职责', normalizeText(input.inboxPrompt) || fallback.inboxPrompt],
    ].filter(([, content]) => content);
    const lines = [FIXED_MANAGER_SYSTEM_PROMPT];
    sections.forEach(([title, content]) => {
        lines.push('', `## ${title}`, String(content));
    });
    return lines.join('\n').trim();
}

export function buildTavernManagerSystemPrompt(input: Partial<TavernAssistantPreset> = {}): string {
    return composeManagerSystemPrompt(input);
}

export function buildDefaultMemoryManagerPrompt(): string {
    return composeManagerSystemPrompt(buildDefaultAssistantPresetSections());
}

export function createDefaultTavernAssistantPreset(): TavernAssistantPreset {
    const sections = buildDefaultAssistantPresetSections();
    return {
        id: DEFAULT_TAVERN_ASSISTANT_PRESET_ID,
        name: '默认助手预设',
        description: '记忆管理员的默认维护规则。',
        version: '3.0.0',
        ...sections,
        memoryManagerPrompt: composeManagerSystemPrompt(sections),
    };
}

export function normalizeTavernAssistantPreset(input: LegacyAssistantPresetInput = {}): TavernAssistantPreset {
    const fallback = createDefaultTavernAssistantPreset();
    const id = normalizeText(input.id) || fallback.id;
    const name = normalizeText(input.name) || fallback.name;
    const normalized: TavernAssistantPreset = {
        id,
        name,
        description: String(input.description || ''),
        version: normalizeText(input.version) || fallback.version || '',
        storyArcPrompt: normalizeAssistantSectionText(input.storyArcPrompt, fallback.storyArcPrompt, LEGACY_DEFAULT_SECTIONS.storyArcPrompt),
        statePrompt: normalizeAssistantSectionText(input.statePrompt, fallback.statePrompt, LEGACY_DEFAULT_SECTIONS.statePrompt),
        episodePrompt: normalizeAssistantSectionText(input.episodePrompt, fallback.episodePrompt, LEGACY_DEFAULT_SECTIONS.episodePrompt),
        inboxPrompt: normalizeAssistantSectionText(input.inboxPrompt, fallback.inboxPrompt, LEGACY_DEFAULT_SECTIONS.inboxPrompt),
        updatedAt: Number(input.updatedAt) || undefined,
    };
    normalized.memoryManagerPrompt = composeManagerSystemPrompt(normalized);
    return normalized;
}
