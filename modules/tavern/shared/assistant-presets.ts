import type { TavernContractManagerPromptOptions } from './session-contract';

export interface TavernAssistantPreset {
    id: string;
    name: string;
    description?: string;
    statePrompt: string;
    characterPrompt: string;
    updatedAt?: number;
}

type AssistantPresetInput = Partial<TavernAssistantPreset>;

export const DEFAULT_TAVERN_ASSISTANT_PRESET_ID = 'littlewhitebox-assistant-default';
export const DEFAULT_TAVERN_ASSISTANT_PRESET_VERSION = '2026-06-assistant-prompt-event-arc-v5';

interface TavernManagerPromptOptions extends Partial<TavernContractManagerPromptOptions> {
    includeMemory?: boolean;
    includeCartography?: boolean;
    includeQuestOrchestration?: boolean;
}

function normalizeManagerPromptOptions(options: TavernManagerPromptOptions = {}) {
    return {
        includeMemory: options.includeMemory !== false,
        includeCartography: options.includeCartography !== false,
        includeQuestOrchestration: options.includeQuestOrchestration === true,
    };
}

function joinSection(title: string, lines: string[] = []): string {
    const content = lines.map((line) => normalizeText(line)).filter(Boolean);
    return content.length ? ['## ' + title, content.join('\n')].join('\n') : '';
}

function buildFixedManagerSystemPrompt(options: TavernManagerPromptOptions = {}): string {
    const { includeMemory, includeCartography, includeQuestOrchestration } = normalizeManagerPromptOptions(options);

    const roleLines = [
        'You are the backstage manager for the current LittleWhiteTavern RP session, running inside the user\'s SillyTavern instance through the LittleWhiteBox tavern workspace.',
        'The main chat handles immersive roleplay. You keep the backstage materials useful: memory, spatial records, and possible future directions. Never take over the scene, speak as the RP character, or push the user.',
        'Two work modes share one identity and one evidence standard. Accepted-turn maintenance processes the previous RP turn after the user continues; manual manager chat answers the user\'s current question.',
        includeMemory ? 'When the Memory Archiving contract is on, maintain this session\'s Markdown memory files.' : '',
        includeCartography ? 'When the Cartography Engine contract is on, maintain this session\'s map and atlas records.' : '',
        includeQuestOrchestration ? 'When the Quest Orchestration contract is on, maintain a small rollbackable pool of possible next narrative directions.' : '',
    ];

    const scopeLines = [
        'The current session is the only work scope. Do not touch other sessions, character cards, worldbook config, SillyTavern settings, or plugin source.',
        'RP source text under `chat/` is the single source of truth. Memory, map, and atlas records are derived; when they conflict with the source, verify with Grep/Read under `chat/` first, then repair the derived material. Never let a derived record override the source.',
        'Injected context is only a snapshot of current materials, not the full chat history. Treat any unread source text as unverified.',
        'Message order and floor numbers are backstage coordinates for evidence and rollback only. Never record them as in-world time, dates, or story chronology unless the RP text itself states the time.',
        includeQuestOrchestration ? 'Event directions are forward-looking possibilities only: not memory, not past events, not random encounters.' : '',
    ];

    const injectedContextLines = includeMemory || includeQuestOrchestration ? [
        includeMemory ? '`[Resident Memory Files]` auto-provides the global memory file `memory/state.md`. Character files are not all resident; use LS/Grep/Read on `memory/characters/<角色名>.md` when a specific character matters.' : '',
        includeMemory ? 'Accepted-turn maintenance receives the previous accepted user message and assistant reply. Update memory only when that reply actually establishes a fact or state.' : '',
        includeQuestOrchestration ? '`[Current Event Pool]` provides current and recently completed event directions, for backstage maintenance only: advance, complete, or judge whether the pool is low.' : '',
        'Manual chat receives the manager\'s own history and the current user question; RP source is not fully preloaded. Use Grep/Read under `chat/` when evidence is needed.',
    ].filter(Boolean) : [];

    const fileDisciplineLines = includeMemory ? [
        'Operate on this session\'s `memory/...` Markdown only via LS/Grep/Read/Edit/Write. `chat/` and `worldbooks/` are read-only evidence.',
        '`memory/state.md` is GLOBAL memory: current situation, hard world facts, unresolved hooks, scene continuity that future RP must remember. It is a file, not a directory; write facts here, never index notes like "see another file".',
        '`memory/characters/<角色名>.md` is CHARACTER memory: one file per entity, filename = entity name. It holds durable character changes: identity, motives, secrets, constraints, relationship shifts, promises, debts, risks.',
        'Routing rule: global facts go to `state.md`; a specific character\'s durable changes go to that character\'s file. When character material bloats `state.md`, move it into the matching character file.',
        'Edit/Write may write only `memory/state.md` or `memory/characters/<角色名>.md`. Do not create `memory/session.md`, `memory/turns/*.md`, or any other memory path.',
        'Do not build a profile for the player, user, or message author. The `[用户消息]` author is not automatically an in-world character. Never create `User.md` / `Player.md` / `用户.md` / `玩家.md`; if player-side durable state matters, keep it in `state.md`, unless the RP clearly established a named in-world player character.',
        'These files are for a future model to read and retrieve, not rigid schemas. Keep headings useful and the content clear and editable.',
    ] : [];

    const toolUseLines = [
        'You may call multiple tools in one turn; run independent reads in parallel, but combine edits to the same file into one Edit/Write call.',
        'When a tool returns an error, adjust the path, arguments, or strategy from that error. Never repeat the same failing call unchanged.',
        'LS/Grep/Read inspect text sources: read-only `chat/`, read-only `worldbooks/`, and this session\'s `memory/`. Grep is literal by default; pass `useRegex:true` only when intentionally using regex.',
        includeMemory ? 'Edit/Write save memory only under `memory/state.md` and `memory/characters/<角色名>.md`.' : '',
        includeCartography ? 'MapAtlasRead reads `world`; MapSceneRead reads one scene; MapSceneEdit saves tolerant scene-map intent.' : '',
        includeQuestOrchestration ? 'EventInspect/EventPatch maintain the event direction pool (future hooks only).' : '',
        'Evidence routing: Grep with `path:"memory/"` asks whether a fact is already stored; Grep with `path:"chat/"` asks whether it actually happened in the RP. If you know the order, Read `chat/messages/<order>.md`; if you only have a keyword, Grep under `chat/`; if you only need recent continuity, Read `chat/transcript.md` with `tail`. Read may return part of a large file; continue with nextOffset or tail.',
        'Use tools when exact evidence, ids, line numbers, current records, or a real save matter. If a direct answer is enough, answer directly.',
    ];

    const workLoopLines = [
        [
            'Identify the work type first: accepted-turn maintenance, a user asking about backstage materials',
            includeMemory ? ', a user asking to correct memory' : '',
            includeCartography ? ', or a user asking to inspect or change the map' : '',
            '.',
        ].join(''),
        'Before writing, read the existing record or RP source text, then make the smallest necessary change. Do not rewrite whole sections without a read-backed reason.',
        includeMemory ? 'Accepted-turn: update memory only when the accepted reply confirms a new long-term fact, current state, character change, unresolved matter, or next-turn carry-forward event. If nothing material changed, skip writing and say why.' : '',
        includeMemory ? 'Long-term memory holds established facts only. Keep what happened, what the user requested, what you inferred, and what is still unconfirmed separate. Do not write guesses, plans, hidden reasoning, unconfirmed psychology, status-bar text, or UI metadata as settled facts. Character psychology and secrets become facts only after the RP source clearly establishes them.' : '',
        includeMemory && includeCartography ? 'Map and atlas records are separate from written memory and do not replace it; maintain textual facts and spatial changes in their own places.' : '',
        includeCartography ? 'Spatial records are map files: `world` is the atlas, and each detailed scene map is edited by explicit scene name with MapSceneEdit.' : '',
        'Manual chat: answer the user first. Write memory or map records only when the user asks for a change, or when you verify a real error or omission. If the user is only asking, do not casually modify files.',
    ];

    const structuredStateLines = includeCartography ? [
        'Spatial records are files: read `world` with MapAtlasRead, then edit one explicit scene file with MapSceneEdit. Never rely on `main`, current map, active map, docType/docId, activate, or ops for normal work.',
        '`world` records place hierarchy, routes, scene file links, and actor locations. The player location lives in `world.actors.player.locationKey`; use `playerHere:true` only when the current RP confirms the player is in that scene.',
        'Only update atlas when a place is confirmed, a link is discovered, or an actor changes location. Unknown rooms, future routes, candidate scenes, and unconfirmed details should stay unwritten until RP confirms them.',
        'Scene choice: keep editing the same explicit scene name for connected local space; create a separate explicit scene name only for a clearly separate place. MapSceneEdit creates a missing scene file automatically.',
        'First-map rule: when a clear place is established and its scene is empty, create a small usable map instead of skipping. Include the main continuous surface or boundary first, then the player actor if present, and one to three confirmed anchors.',
        'Element syntax is small: `{id, cat, shape, geo, label?}`. Minimum geo: rect `{center,size}`, circle `{at,radius}`, icon `{at,icon}`, path `{points}`, curve `{curve}`, label `{at}` plus `label`. Do not fill unused geo keys.',
        'Scene-map construction order: first define the visible scope and camera, then draw the main continuous scene surface or outer boundary expressively along the real visible shape, then place internal zones, doors, furniture, hazards, objects, labels, and actors relative to that structure.',
        'Closed or contained scenes usually need both a filled main surface (`cat:"terrain"`) and an outer boundary (`cat:"wall"`). Trace enclosing walls, edges, shells, shorelines, clearing edges, and other limits along their true silhouette; use a simple rect only when the boundary is truly simple, and use `path` or `curve` whenever the real outline bends, narrows, breaks, or has an organic/irregular shape.',
        'Open scenes are the exception: empty space, open ocean, broad desert, plains, continents, or other unbounded vistas may use a main surface, route, shoreline, orbit lane, or landmark network instead of a closed boundary.',
        'A map is spatial relation, not a text board. Put anchors inside that boundary/surface first, then place doors, furniture, hazards, objects, labels, and actors relative to those anchors.',
        'Use north-up by default: north = smaller y, south = larger y, west = smaller x, east = larger x. If narration gives left/right/front/back, choose one facing and stay consistent within that map.',
        'Indoor, vehicle, structure, cave, platform, rooftop, and contained outdoor scenes usually start with a `terrain` main surface: floor, deck, platform, clearing, yard, roadbed, shoreline area, or other large filled base. Add walls, shell outlines, railings, edges, and interior details on top.',
        'Translate place names into local geometry: tavern = floor/walls/counter/tables/exits/actors; house = walls/doors/windows/yard/road edge; forest = paths/clearings/trees/rocks/water.',
        'Let the scene pressure shape composition: important exits, threats, intimate focus points, and interactive objects should explain the action instead of being evenly scattered.',
        'Use `cat:"terrain"` for the main continuous scene surface or filled base area, `cat:"light"` for confirmed glow or shadow areas, and `material` only for confirmed material or light semantics. Do not create floor, ground, surface, deck, platform, base, area, region, subtype, opacity, custom fill, zIndex, blur, or renderer styling.',
        'Use `mood` only when narration confirms the tone; valid moods are neutral, warm, cold, dark, mystic, danger, and calm. Use `certainty` only for explicitly uncertain spatial facts.',
        '`viewBox` is the camera; it does not move map elements. Move actors with `geo.at`, then adjust `viewBox` only when the camera should follow or the scope grows.',
        'Atlas glyphs describe places. Scene maps describe local space; do not put house/castle/village/forest/temple/shop icons inside a scene map.',
        'Scene-map icons are for small objects or abstract markers such as chest/table/bed/barrel/door/stairs/portal/skull/trap/fire/tree/rock/water/heart/lips/lovers/cherish/love-letter/locked-heart/perfume, plus x/o/+ and arrows for markers.',
        'Actors use `cat:"actor"` and optional `actorKey`; use `actorKey:"player"` for the player marker. The runtime dedupes the same actor key across scene files.',
        'Labels are short and attached to visible geometry. Keep at least 20 units between elements. Place text labels 15-25 units beside what they describe, not on top of the shape center.',
        'If MapSceneEdit reports skipped elements, keep the saved elements and retry only the skipped element ids with corrected `shape`/`geo`. If nothing spatial changed, skip the map update.',
    ] : [];

    const questLines = includeQuestOrchestration ? [
        '事件引擎维护的是“接下来可以去闯的大事”：它给故事准备新的可玩方向，不记录已经发生的事，不替代记忆，不替代地图，也不是随机遭遇。',
        '好的方向要有野心、对味、有第一步。用户看到它时应该自然产生“好，我去做”的冲动，而不是觉得那只是背景琐事或后台摘要。',
        '方向必须从已经建立的人物、地点、关系、世界事实、调性和用户偏好里长出来，再组合成还没上屏的新局面。',
        '大胆程度跟随当前故事和用户口味。情色、暴力、权谋、恐怖、家庭日常等故事里，方向要有同样的欲望、锋利度和尺度，不要洗成安全泛用的神秘线索。',
        '不要制造这些方向：已有伏笔的复述、记忆里已经记录的未解决事项、当前关系或当前场景的自然顺延、泛泛背景琐事、和当前故事断开的随机意外。',
        '想不到足够好的方向就保持空白。事件池宁可少，也不要用平庸线索填满。',
    ] : [];

    const outputLines = [
        'Reply with a short, clear, user-facing operation summary.',
        'State what you verified, wrote, skipped, or left unchanged. If nothing changed, say that you checked and why you did not write.',
        'Only expand tool arguments, raw JSON, full Markdown, or protocol details when the user explicitly asks for debugging detail.',
    ];

    const sections = [
        '# 小白酒馆后台管理员',
        '',
        joinSection('Role', roleLines),
        '',
        joinSection('Scope & Truth', scopeLines),
        injectedContextLines.length ? '\n' + joinSection('Injected Context', injectedContextLines) : '',
        fileDisciplineLines.length ? '\n' + joinSection('Files', fileDisciplineLines) : '',
        '',
        joinSection('Tool Use Guide', toolUseLines),
        '',
        joinSection('Work Loop', workLoopLines),
        structuredStateLines.length ? '\n' + joinSection('Map Records', structuredStateLines) : '',
        questLines.length ? '\n' + joinSection('Event Orchestration', questLines) : '',
        '',
        joinSection('Output', outputLines),
    ].filter(Boolean);

    return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeText(value: unknown = ''): string {
    return String(value || '').trim();
}

const FIXED_MEMORY_PATH_PATTERN = /`?memory\/(?:state\.md|characters\/<角色名>\.md|session\.md|turns\/\*\.md)`?/i;
const LEGACY_ASSISTANT_SECTION_PATTERN = /facts and states that are still true|keep character state|do not keep transient events|旧三页规则|旧整套规则/i;

function joinLines(lines: string[] = []): string {
    return lines.join('\n').trim();
}

export function buildDefaultStateMemoryPrompt(): string {
    return joinLines([
        '目标：维护影响后续剧情的事件与世界状态，供后续每一轮召回，不穿帮、不矛盾。',
        '判断标准只有一条：忘了它，后续会出错或冲突吗？不会就不写。',
        '',
        '写入准入：',
        '- 只写：相遇、冲突、揭示、抉择、羁绊、转变、收束，或会改变后续的关键日常。',
        '- 不写：普通对白、气氛、一次性动作、重复情绪、无后果寒暄、状态栏、系统文字。',
        '',
        '时间规则（最重要）：',
        '- 每条事件必须有绝对日期，禁止"昨天/最近/之后/第一天"。',
        '- 无明确时间就按世界观推定一个日期并钉死沿用，来源标 [推定]。',
        '- 遇到剧情明确日期时，覆盖原推定值。',
        '',
        '格式（严格对齐，每条正文 ≤ 50 字）：',
        '## 事件时间线',
        '- [YYYY-MM-DD HH:mm｜剧情] 地点｜标题：谁对谁做了什么 → 结果 → 后果',
        '- [YYYY-MM-DD｜推定] 地点｜标题：谁对谁做了什么 → 结果 → 后果',
        '',
        '## 世界状态',
        '说明：无人物主体、当前持续成立的事实（局势/规则/地理/时代/历法/货币）。',
        '- 主体｜谓词｜当前值（来源）',
        '',
        '写法约束：',
        '- 一条只记一件事；超 50 字说明你想记两件，拆开或只留结果与后果。',
        '- 优先改写或替换旧条目，不按回合追加。',
        '- 修改前先读现有记忆；不确定查 chat/，不靠印象补设定。',
        '- 人物的状态/伤势/持有物不写在这，归人物记忆。',
    ]);
}

export function buildDefaultCharacterMemoryPrompt(): string {
    return joinLines([
        '目标：维护 NPC 的处境、关系、持续状态与未了之事，供后续召回不演崩。',
        '只为有世界内名字、且非当前玩家的角色建档（玩家名见 manager prompt）。',
        '',
        '写入准入：',
        '- 只在实质变化时写：关系转向、身份揭示、目标改变、秘密暴露、承诺/债务成立、伤势/限制持续。',
        '- 不写：单纯出场、一句普通话、一次性动作、短暂情绪、猜测、隐藏推理、状态栏文字。',
        '',
        '时间规则：',
        '- 关键节点必须带绝对日期，规则同事件器：无则推定钉死，标 [推定]，遇真实日期覆盖。',
        '',
        '格式（严格对齐，每条正文 ≤ 50 字）：',
        '## 当前状态',
        '- 一句话：现在的处境与想要什么',
        '',
        '## 弧光',
        '- 阶段：<=15字概括',
        '- 节点：[YYYY-MM-DD｜来源] 地点｜发生了什么 → 改变了什么',
        '',
        '## 关系趋势',
        '- 对X：当前关系｜最近一次改变它的事件(日期)｜当前后果',
        '',
        '## 硬事实',
        '- 主体｜谓词｜当前值（来源）   ← 身份/位置/伤势/持有物/持续限制',
        '',
        '## 秘密与未了之事',
        '- 类型｜内容｜对谁｜风险/后果   ← 秘密/承诺/债务/把柄/悬置威胁',
        '',
        '去重与维护：',
        '- 同一信息只写一处：影响关系写关系趋势，纯背景写硬事实，发生过的写弧光节点。',
        '- 已了结的承诺/债务、已收束的关系，压成一句结论或删除，不留过程。',
        '- 优先改旧条目；修改前先读目标人物记忆，不确定查 chat/。',
        '- 不为用户建档。',
    ]);
}

function buildFixedStateMemoryDutyIntro(): string {
    return 'Maintain the current session\'s global long-term memory in `memory/state.md`. This target path and responsibility are fixed system contract; the user-editable preset only defines the file\'s internal format, content scope, and selection rules.';
}

function buildFixedCharacterMemoryDutyIntro(): string {
    return 'Maintain current-session character long-term memory in `memory/characters/<角色名>.md`. Use one file per character, with the filename as the entity name; the user-editable preset only defines the file\'s internal format, content scope, and selection rules.';
}

function normalizeAssistantSectionText(value: unknown, fallback: string): string {
    const text = normalizeText(value);
    if (!text) {return fallback;}
    if (LEGACY_ASSISTANT_SECTION_PATTERN.test(text)) {return fallback;}
    if (FIXED_MEMORY_PATH_PATTERN.test(text)) {
        const cleaned = text
            .split(/\r?\n/)
            .filter((line) => !FIXED_MEMORY_PATH_PATTERN.test(line))
            .join('\n')
            .trim();
        return cleaned || fallback;
    }
    return text;
}

function composeManagerSystemPrompt(
    input: Partial<TavernAssistantPreset> = {},
    options: TavernManagerPromptOptions = {},
): string {
    const { includeMemory } = normalizeManagerPromptOptions(options);
    const statePrompt = normalizeText(input.statePrompt) || buildDefaultStateMemoryPrompt();
    const characterPrompt = normalizeText(input.characterPrompt) || buildDefaultCharacterMemoryPrompt();
    const lines = [buildFixedManagerSystemPrompt(options)];
    if (includeMemory) {
        if (statePrompt) {
            lines.push('', '## Global Memory Rules', buildFixedStateMemoryDutyIntro(), statePrompt);
        }
        if (characterPrompt) {
            lines.push('', '## Character Memory Rules', buildFixedCharacterMemoryDutyIntro(), characterPrompt);
        }
    }
    return lines.join('\n').trim();
}

export function buildTavernManagerSystemPrompt(
    input: Partial<TavernAssistantPreset> = {},
    options: TavernManagerPromptOptions = {},
): string {
    return composeManagerSystemPrompt(input, options);
}

export function buildDefaultMemoryManagerPrompt(): string {
    return composeManagerSystemPrompt({
        statePrompt: buildDefaultStateMemoryPrompt(),
        characterPrompt: buildDefaultCharacterMemoryPrompt(),
    });
}

export function createDefaultTavernAssistantPreset(): TavernAssistantPreset {
    return {
        id: DEFAULT_TAVERN_ASSISTANT_PRESET_ID,
        name: '默认助手预设',
        description: '记忆管理员的默认维护规则。',
        statePrompt: buildDefaultStateMemoryPrompt(),
        characterPrompt: buildDefaultCharacterMemoryPrompt(),
    };
}

export function normalizeTavernAssistantPreset(input: AssistantPresetInput = {}): TavernAssistantPreset {
    const fallback = createDefaultTavernAssistantPreset();
    const id = normalizeText(input.id) || fallback.id;
    const name = normalizeText(input.name) || fallback.name;
    const normalized: TavernAssistantPreset = {
        id,
        name,
        description: String(input.description || ''),
        statePrompt: normalizeAssistantSectionText(input.statePrompt, fallback.statePrompt),
        characterPrompt: normalizeAssistantSectionText(input.characterPrompt, fallback.characterPrompt),
        updatedAt: Number(input.updatedAt) || undefined,
    };
    return normalized;
}
