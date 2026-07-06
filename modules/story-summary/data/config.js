import { extension_settings } from "../../../../../../extensions.js";
import { EXT_ID } from "../../../core/constants.js";
import { xbLog } from "../../../core/debug-core.js";
import { CommonSettingStorage } from "../../../core/server-storage.js";

const MODULE_ID = "summaryConfig";
const SUMMARY_CONFIG_KEY = "storySummaryPanelConfig";
const SUMMARY_CONFIG_LOCAL_STORAGE_KEY = "summary_panel_config";
const VALID_TRIGGER_TIMINGS = new Set(["after_ai", "before_user"]);
let summaryPanelConfigCache = null;

const DEFAULT_FILTER_RULES = [
    { start: "<think>", end: "</think>" },
    { start: "<thinking>", end: "</thinking>" },
    { start: "```", end: "```" },
];

export const DEFAULT_SUMMARY_SYSTEM_PROMPT = `Emotional Memory Analyst: This task involves conversation comprehension and structured incremental summarization, representing emotional memory analysis at the intersection of relationship continuity, character state tracking, and long-term interaction memory.
[Read the settings for this task]
<task_settings>
Incremental_Summary_Requirements:
  - Incremental_Only: 只提取新对话中的新增要素，绝不重复已有总结
  - Memory_Granularity: 记录能够改变未来互动方式的片段（边界、习惯、承诺、交换条件、回避模式、照顾方式、触发点），而非情绪评价或泛化概括
  - Memory_Album_Style: 形成有细节、有温度、有记忆点的回忆册
  - Retrieval_Readiness: event.summary 必须面向未来召回，不得写成泛化剧情概括
  - Event_Classification:
      type:
        - 相遇: 人物/事物初次接触
        - 冲突: 对抗、误解、边界试探、情绪顶撞
        - 揭示: 信息松动、隐瞒被打破、主动坦白、无意泄露
        - 抉择: 明确站队、承诺、拒绝、回避、留白
        - 羁绊: 关系加深或破裂
        - 转变: 角色/局势改变
        - 收束: 问题解决、和解
        - 日常: 共同生活片段、照顾、习惯性互动、低强度陪伴
      weight:
        - 核心: 删掉这段记忆，关系理解会明显断裂
        - 主线: 推动当前关系或重要情绪线
        - 转折: 改变关系走向、信任程度或边界状态
        - 点睛: 有细节不影响主线
        - 氛围: 纯粹氛围片段
    - Causal_Chain: 为每个新事件标注直接前因事件ID（causedBy）。仅在因果关系明确（直接导致/明确动机/承接后果）时填写；不明确时填[]完全正常。0-2个，只填 evt-数字，指向已存在或本次新输出事件。
  - Character_Dynamics: 识别新角色，追踪角色认知变化和行为偏移
  - Fact_Tracking: 维护 SPO 三元组知识图谱。追踪身份、边界、承诺、偏好、禁忌、物品归属、位置、关系等硬性事实。采用 KV 覆盖模型（s+p 为键）。
</task_settings>
---
Story Analyst:
[Responsibility Definition]
\`\`\`yaml
analysis_task:
  title: Incremental Emotional Memory Summarization with Knowledge Graph
  Emotional Memory Analyst:
    role: Antigravity
    task: >-
      To analyze provided dialogue content against existing summary state,
      extract only NEW emotional beats, relationship changes, state shifts,
      recurring cues, and fact updates, outputting structured JSON for
      incremental memory database updates.
  assistant:
    role: Memory Specialist
    description: Incremental Emotional Summary & Knowledge Graph Analyst
    behavior: >-
      To compare new dialogue against existing summary, identify genuinely
      new emotional events and character interactions, classify events by
      relational type and weight, track relationship arc progression with
      percentage, maintain facts as SPO triples with clear semantics,
      and output structured JSON containing only incremental updates.
      Must strictly avoid repeating any existing summary content.
  user:
    role: Content Provider
    description: Supplies existing summary state and new dialogue
    behavior: >-
      To provide existing summary state (events, characters, arcs, facts)
      and new dialogue content for incremental analysis.
interaction_mode:
  type: incremental_analysis
  output_format: structured_json
  deduplication: strict_enforcement
execution_context:
  summary_active: true
  incremental_only: true
  memory_album_style: true
  fact_tracking: true
\`\`\`
---
Memory Specialist:
<Chat_History>`;

export const DEFAULT_MEMORY_PROMPT_TEMPLATE = `以上是还留在眼前的对话
以下是脑海里的记忆：

{$剧情记忆}
这些记忆是真实的，请自然地记住它们。`;

export const DEFAULT_SUMMARY_ASSISTANT_DOC_PROMPT = `
Memory Specialist:
Acknowledged. Now reviewing the incremental summarization specifications:

[Event Classification System]
├─ Types: 相遇|冲突|揭示|抉择|羁绊|转变|收束|日常
├─ Weights: 核心|主线|转折|点睛|氛围
└─ Each event needs: id, title, timeLabel, summary(含楼层), participants, type, weight

[Event Summary Style]
- summary 不是剧情概括，而是高召回的回忆卡片
- 必须优先保留原词：正式人名、原文称呼/昵称/别称、地点、关键物件、动作、情绪态度、关系变化、约定/承诺/交换条件、秘密或羞辱/暧昧/冲突钩子
- 必须识别互动规则的变化：例如默认报备、交换条件、照顾方式、边界松动、回避策略、重复出现的试探模式，以及「差一点越界但最终克制」的行为
- 必须记录能反映角色状态的生活痕迹：如衣服上的污渍、未退出的界面、回复消息时的微表情、没有说出口的话、临时改口的理由等痕迹
- 不要写“两人发生冲突”“关系恶化”“有暧昧互动”“揭示了一个秘密”这种空话，必须写清是谁在什么地方拿着什么、对谁做了什么、结果怎样
- 优先写成 1 句；信息确实过多且确有必要时可写 2 句，但不要拆成空泛铺垫 + 具体补充
- 允许 summary 略密实，但必须让未来一句口语提法也能认出这段
- 示例只展示具体度，不要求模仿题材、语气或句式
- 不合格：
  1. 二人在酒馆发生冲突，关系恶化。
  2. 两人有暧昧互动，并约定再次见面。
  3. 她揭示了一个秘密，对方受到打击。
- 合格：
  1. 苏晚在黑鹭酒馆当众把欠条拍到顾衡胸口，骂他拿她母亲的旧宅做赌注，顾衡想抓她手腕被她甩开，周围赌客起哄，两人彻底撕破脸。 (#120-123)
  2. 周柠在旅馆浴室门口盯着林雨锁骨上的咬痕，逼问昨晚和谁在一起，林雨一边整理湿透的白衬衫一边嘴硬否认，最后答应明晚还去旧码头见她。 (#88-91)

[Fact Tracking - SPO / World Facts]
We maintain a small "world state" as SPO triples.
Each update is a JSON object: {s, p, o, isState, retracted?}

Core rules:
1) Keyed by (s + p). If a new update has the same (s+p), it overwrites the previous value.
2) Only output facts that are NEW or CHANGED in the new dialogue. Do NOT repeat unchanged facts.
3) isState meaning:
   - isState: true  -> core constraints that must stay stable and should NEVER be auto-deleted
                    (identity, location, life/death, ownership, relationship status, binding rules)
   - isState: false -> non-core facts / soft memories / temporary states, may be pruned by capacity limits later
4) Relationship facts:
   - Use predicate format: "对X的看法" (X is the target person)
5) Retraction (deletion):
   - To delete a fact, output: {s, p, retracted: true}
6) Predicate normalization:
   - Reuse existing predicates whenever possible, avoid inventing synonyms.
   - Prefer stable predicates for long-term memory, avoid over-fragmentation.

Ready to process incremental summary requests with strict deduplication.`;

export const DEFAULT_SUMMARY_ASSISTANT_ASK_SUMMARY_PROMPT = `
Memory Specialist:
Specifications internalized. Please provide the existing summary state so I can:
1. Index all recorded events to avoid duplication
2. Map current character list as baseline
3. Note existing arc progress levels
4. Identify established keywords
5. Review current facts (SPO triples baseline)`;

export const DEFAULT_SUMMARY_ASSISTANT_ASK_CONTENT_PROMPT = `
Memory Specialist:
Existing summary fully analyzed and indexed. I understand:
├─ Recorded events: Indexed for deduplication
├─ Character list: Baseline mapped
├─ Keywords: Current state acknowledged
└─ Facts: SPO baseline loaded

I will extract only genuinely NEW elements from the upcoming dialogue.
Please provide the new dialogue content requiring incremental analysis.`;

export const DEFAULT_SUMMARY_META_PROTOCOL_START_PROMPT = `
Memory Specialist:
ACKNOWLEDGED. Beginning structured JSON generation:
<meta_protocol>`;

export const DEFAULT_SUMMARY_USER_JSON_FORMAT_PROMPT = `
## Output Rule
Generate a single valid JSON object with INCREMENTAL updates only.

## Mindful Approach
Before generating, observe the USER and analyze carefully:
- What NEW emotional beats, relationship changes, state shifts, or fact changes happened in this round?
- Where is the boundary between existing memories and the new content?
- Which concrete details are worth preserving for future recall?
- What NEW events occurred (not in existing summary)?
- What NEW characters appeared for the first time?
- What CHANGES happened to one's cognition?
- What facts changed? (status/position/ownership/relationships/boundaries/preferences)

## factUpdates 规则
- 目的: 纠错 & 世界一致性约束，只记录硬性事实
- s+p 为键，相同键会覆盖旧值
- isState: true=核心约束(身份/关系/边界/偏好/禁忌/所有权/绑定规则)，false=有容量上限会被清理
- 关系类: p="对X的看法"
- 删除: {s, p, retracted: true}，不需要 o 字段
- 更新: {s, p, o, isState, trend?}
- 谓词规范化: 复用已有谓词，不要发明同义词
- 只输出有变化的条目，确保少、硬、稳定

## Output Format
\`\`\`json
{
  "mindful_prelude": {
    "user_insight": "本轮主要新增了哪些情节、关系或事实，哪些细节值得进入可召回摘要",
    "dedup_analysis": "已有X个事件，本次识别Y个新事件",
    "fact_changes": "识别到的事实变化概述"
  },
  "keywords": [
    {"text": "综合历史+新内容的全剧情关键词(5-10个)", "weight": "核心|重要|一般"}
  ],
  "events": [
    {
      "id": "evt-{$nextEventId}起始，依次递增",
      "title": "地点·事件标题",
      "timeLabel": "时间线标签(格式：Day x: MM/DD 时段。如：Day 2: 10/25 晚上、Day 3: 10/26 早晨、Day 17: 11/09 深夜)",
      "summary": "回忆卡片。优先写成1句；信息确实过多时可写2句。必须保留正式人名、原文称呼/昵称、地点、物件、具体动作和可召回钩子，末尾标注楼层(#X-Y)",
      "participants": ["参与角色名，不要使用人称代词或别名，只用正式人名"],
      "type": "相遇|冲突|揭示|抉择|羁绊|转变|收束|日常",
      "weight": "核心|主线|转折|点睛|氛围",
      "causedBy": ["evt-12", "evt-14"]
    }
  ],
  "newCharacters": ["仅本次首次出现的角色名"],
  "factUpdates": [
    {"s": "主体", "p": "谓词", "o": "当前值", "isState": true},
    {"s": "要删除的主体", "p": "要删除的谓词", "retracted": true}
  ]
}
\`\`\`

## CRITICAL NOTES
- events.id 从 evt-{$nextEventId} 开始编号
- 仅输出【增量】内容，已有事件绝不重复
- summary 按 doc 中的“Event Summary Style”执行，不要写成泛化概括
- 事件切分：一个 event = 一个有独立召回价值的情节单元。当【场景/地点、时间、在场人物、情节焦点或关系状态】发生明显切换时另起一个 event；同一场景内围绕同一焦点的连续推进（如试探→坦白→回避、铺垫→越界→克制）合为一个 event、在 summary 内按顺序写清，既不要拆成多条空泛条目，也不要把无关的两件事塞进同一个 event
- keywords 是全局关键词，综合已有+新增
- causedBy 仅在因果明确时填写，允许为[]，0-2个
- factUpdates 可为空数组
- 合法JSON，字符串值内部避免英文双引号
- 用朴实、白描、有烟火气的笔触记录事实，避免比喻和意象
- 严谨、注重细节，避免使用模糊的概括性语言，应用具体的动词描述动作，例:谁,在什么时间/地点,通过什么方式,对谁,做了什么事,出现了什么道具,结果如何。
</meta_protocol>

## Placeholder Notes
- {$nextEventId} 会在运行时替换成实际起始事件编号，不要删除
- {$existingEventCount}、{$historyRange} 这类占位符如果出现在你的自定义版本里，通常也不应该删除`;

export const DEFAULT_SUMMARY_ASSISTANT_CHECK_PROMPT = `Content review initiated...
[Compliance Check Results]
├─ Existing summary loaded: ✓ Fully indexed
├─ New dialogue received: ✓ Content parsed
├─ Deduplication engine: ✓ Active
├─ Event classification: ✓ Ready
├─ Fact tracking: ✓ Enabled
└─ Output format: ✓ JSON specification loaded

[Material Verification]
├─ Existing events: Indexed ({$existingEventCount} recorded)
├─ Character baseline: Mapped
├─ Facts baseline: Loaded
└─ Output specification: ✓ Defined in <meta_protocol>
All checks passed. Beginning incremental extraction...
{
  "mindful_prelude":`;

export const DEFAULT_SUMMARY_USER_CONFIRM_PROMPT = `怎么截断了！重新完整生成，只输出JSON，不要任何其他内容，3000字以内
</Chat_History>`;

export const DEFAULT_SUMMARY_ASSISTANT_PREFILL_PROMPT =
    "下面重新生成完整JSON。";
export const BUILTIN_SUMMARY_PROMPTS = Object.freeze({
    summarySystemPrompt: DEFAULT_SUMMARY_SYSTEM_PROMPT,
    summaryAssistantDocPrompt: DEFAULT_SUMMARY_ASSISTANT_DOC_PROMPT,
    summaryAssistantAskSummaryPrompt:
        DEFAULT_SUMMARY_ASSISTANT_ASK_SUMMARY_PROMPT,
    summaryAssistantAskContentPrompt:
        DEFAULT_SUMMARY_ASSISTANT_ASK_CONTENT_PROMPT,
    summaryMetaProtocolStartPrompt: DEFAULT_SUMMARY_META_PROTOCOL_START_PROMPT,
    summaryUserJsonFormatPrompt: DEFAULT_SUMMARY_USER_JSON_FORMAT_PROMPT,
    summaryAssistantCheckPrompt: DEFAULT_SUMMARY_ASSISTANT_CHECK_PROMPT,
    summaryUserConfirmPrompt: DEFAULT_SUMMARY_USER_CONFIRM_PROMPT,
    summaryAssistantPrefillPrompt: DEFAULT_SUMMARY_ASSISTANT_PREFILL_PROMPT,
});
const DEFAULT_VECTOR_PROVIDER = "siliconflow";
const DEFAULT_L0_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1";
const DEFAULT_L0_MODEL = "Qwen/Qwen3-8B";
const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3";
const DEFAULT_RERANK_MODEL = "BAAI/bge-reranker-v2-m3";

function getVectorProviderDefaultUrl(provider) {
    return provider === "openrouter" ? DEFAULT_OPENROUTER_URL : DEFAULT_L0_URL;
}

function createDefaultProviderProfile(provider, model = "") {
    return {
        url: provider === "custom" ? "" : getVectorProviderDefaultUrl(provider),
        key: "",
        model: model || "",
        modelCache: [],
    };
}

function normalizeProviderProfiles(
    supportedProviders,
    srcProfiles,
    currentProvider,
    currentValues,
    defaultModel,
) {
    const out = {};
    supportedProviders.forEach((provider) => {
        const raw = srcProfiles?.[provider] || {};
        const defaults = createDefaultProviderProfile(provider, defaultModel);
        out[provider] = {
            url: String(raw.url || defaults.url || "").trim(),
            key: String(raw.key || "").trim(),
            model: String(raw.model || defaults.model || "").trim(),
            modelCache: Array.isArray(raw.modelCache)
                ? raw.modelCache.filter(Boolean)
                : [],
        };
    });

    if (currentProvider && out[currentProvider]) {
        if (currentValues?.url && !out[currentProvider].url)
            out[currentProvider].url = String(currentValues.url).trim();
        if (currentValues?.key && !out[currentProvider].key)
            out[currentProvider].key = String(currentValues.key).trim();
        if (currentValues?.model && !out[currentProvider].model)
            out[currentProvider].model = String(currentValues.model).trim();
        if (
            Array.isArray(currentValues?.modelCache) &&
            !out[currentProvider].modelCache.length
        ) {
            out[currentProvider].modelCache =
                currentValues.modelCache.filter(Boolean);
        }
    }

    return out;
}

export function getSettings() {
    const ext = (extension_settings[EXT_ID] ||= {});
    ext.storySummary ||= { enabled: true };
    return ext;
}

function normalizeOpenAiCompatApiConfig(src, defaults = {}) {
    const provider = String(
        src?.provider || defaults.provider || DEFAULT_VECTOR_PROVIDER,
    ).toLowerCase();
    const supportedProviders =
        Array.isArray(defaults.supportedProviders) &&
        defaults.supportedProviders.length
            ? defaults.supportedProviders
            : [provider, "custom"];
    const providers = normalizeProviderProfiles(
        supportedProviders,
        src?.providers,
        provider,
        src,
        defaults.model || "",
    );
    const current =
        providers[provider] ||
        createDefaultProviderProfile(provider, defaults.model || "");
    return {
        provider,
        url: String(current.url || "").trim(),
        key: String(current.key || defaults.key || "").trim(),
        model: String(current.model || defaults.model || "").trim(),
        modelCache: Array.isArray(current.modelCache)
            ? current.modelCache.filter(Boolean)
            : [],
        providers,
    };
}

function normalizeVectorConfig(rawVector = null) {
    const legacyOnline = rawVector?.online || {};
    const sharedProvider = String(
        legacyOnline.provider || DEFAULT_VECTOR_PROVIDER,
    ).toLowerCase();
    const sharedUrl = String(
        legacyOnline.url ||
            (sharedProvider === "openrouter"
                ? DEFAULT_OPENROUTER_URL
                : DEFAULT_L0_URL),
    ).trim();
    const sharedKey = String(legacyOnline.key || "").trim();

    return {
        enabled: !!rawVector?.enabled,
        engine: "online",
        l0Concurrency: Math.max(
            1,
            Math.min(50, Number(rawVector?.l0Concurrency) || 10),
        ),
        l0Api: normalizeOpenAiCompatApiConfig(rawVector?.l0Api, {
            provider: sharedProvider,
            url: sharedUrl,
            key: sharedKey,
            model: DEFAULT_L0_MODEL,
            supportedProviders: ["siliconflow", "openrouter", "custom"],
        }),
        embeddingApi: normalizeOpenAiCompatApiConfig(rawVector?.embeddingApi, {
            provider: DEFAULT_VECTOR_PROVIDER,
            url: DEFAULT_L0_URL,
            key: sharedKey,
            model: DEFAULT_EMBEDDING_MODEL,
            supportedProviders: ["siliconflow", "custom"],
        }),
        rerankApi: normalizeOpenAiCompatApiConfig(rawVector?.rerankApi, {
            provider: DEFAULT_VECTOR_PROVIDER,
            url: DEFAULT_L0_URL,
            key: sharedKey,
            model: DEFAULT_RERANK_MODEL,
            supportedProviders: ["siliconflow", "custom"],
        }),
    };
}

function createDefaultSummaryPanelConfig() {
    const defaults = {
        api: { provider: "st", url: "", key: "", model: "", modelCache: [] },
        gen: {
            temperature: null,
            top_p: null,
            top_k: null,
            presence_penalty: null,
            frequency_penalty: null,
        },
        trigger: {
            enabled: false,
            interval: 20,
            timing: "before_user",
            role: "system",
            useStream: true,
            maxPerRun: 100,
            wrapperHead: "",
            wrapperTail: "",
            forceInsertAtEnd: false,
        },
        ui: {
            hideSummarized: true,
            keepVisibleCount: 6,
            useVectorBoundary: true,
        },
        textFilterRules: [...DEFAULT_FILTER_RULES],
        prompts: {
            memoryTemplate: DEFAULT_MEMORY_PROMPT_TEMPLATE,
        },
        vector: normalizeVectorConfig(),
    };
    return defaults;
}

function cloneConfig(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

function assertSummaryConfigPersisted(expected, actual) {
    if (!actual || typeof actual !== "object") {
        throw new Error("保存后读取配置失败");
    }

    const expectedApi = expected?.api || {};
    const actualApi = actual?.api || {};
    const fields = ["provider", "url", "key", "model"];
    for (const field of fields) {
        if (
            String(actualApi[field] ?? "") !== String(expectedApi[field] ?? "")
        ) {
            throw new Error(`保存校验失败：API ${field} 未写入服务器`);
        }
    }
}

function normalizeSummaryPanelConfig(rawConfig = null) {
    const defaults = createDefaultSummaryPanelConfig();
    const clampKeepVisibleCount = (value) => {
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n)) return 6;
        return Math.max(0, Math.min(50, n));
    };

    if (!rawConfig || typeof rawConfig !== "object") {
        return defaults;
    }

    const textFilterRules = Array.isArray(rawConfig.textFilterRules)
        ? rawConfig.textFilterRules
        : Array.isArray(rawConfig.vector?.textFilterRules)
          ? rawConfig.vector.textFilterRules
          : defaults.textFilterRules;

    const rawPrompts =
        rawConfig.prompts && typeof rawConfig.prompts === "object"
            ? rawConfig.prompts
            : {};

    const result = {
        api: { ...defaults.api, ...(rawConfig.api || {}) },
        gen: { ...defaults.gen, ...(rawConfig.gen || {}) },
        trigger: { ...defaults.trigger, ...(rawConfig.trigger || {}) },
        ui: { ...defaults.ui, ...(rawConfig.ui || {}) },
        textFilterRules,
        prompts: {
            memoryTemplate:
                String(
                    rawPrompts.memoryTemplate ||
                        defaults.prompts.memoryTemplate ||
                        "",
                ).trim() || DEFAULT_MEMORY_PROMPT_TEMPLATE,
        },
        vector: normalizeVectorConfig(rawConfig.vector || null),
    };

    if (String(result.api.provider || "").toLowerCase() === "custom") {
        result.api.provider = "openai";
    }

    if (result.trigger.timing === "manual") {
        result.trigger.timing = defaults.trigger.timing;
        result.trigger.enabled = false;
    } else if (!VALID_TRIGGER_TIMINGS.has(result.trigger.timing)) {
        result.trigger.timing = defaults.trigger.timing;
    }
    if (result.trigger.useStream === undefined) result.trigger.useStream = true;
    result.ui.hideSummarized = !!result.ui.hideSummarized;
    result.ui.keepVisibleCount = clampKeepVisibleCount(
        result.ui.keepVisibleCount,
    );
    result.ui.useVectorBoundary = result.ui.useVectorBoundary !== false;

    return result;
}

function writeConfigToLocalStorage(config) {
    localStorage.setItem(
        SUMMARY_CONFIG_LOCAL_STORAGE_KEY,
        JSON.stringify(config),
    );
}

function setSummaryPanelConfigCache(config, { persistLocal = true } = {}) {
    const normalized = normalizeSummaryPanelConfig(config);
    summaryPanelConfigCache = normalized;
    if (persistLocal) {
        writeConfigToLocalStorage(normalized);
    }
    return normalized;
}

function ensureSummaryPanelConfigCache() {
    if (summaryPanelConfigCache) return summaryPanelConfigCache;

    try {
        const raw = localStorage.getItem(SUMMARY_CONFIG_LOCAL_STORAGE_KEY);
        if (!raw) {
            return setSummaryPanelConfigCache(
                createDefaultSummaryPanelConfig(),
                { persistLocal: false },
            );
        }
        return setSummaryPanelConfigCache(JSON.parse(raw), {
            persistLocal: false,
        });
    } catch {
        return setSummaryPanelConfigCache(createDefaultSummaryPanelConfig(), {
            persistLocal: false,
        });
    }
}

export function getSummaryPanelConfig() {
    return cloneConfig(ensureSummaryPanelConfigCache());
}

export function saveSummaryPanelConfig(config) {
    try {
        const normalized = setSummaryPanelConfigCache(config);
        CommonSettingStorage.set(SUMMARY_CONFIG_KEY, normalized);
        return normalized;
    } catch (e) {
        xbLog.error(MODULE_ID, "保存面板配置失败", e);
        return null;
    }
}

export function getVectorConfig() {
    const cfg = ensureSummaryPanelConfigCache();
    return cfg?.vector ? cloneConfig(cfg.vector) : normalizeVectorConfig();
}

export function getTextFilterRules() {
    const cfg = getSummaryPanelConfig();
    return Array.isArray(cfg?.textFilterRules)
        ? cfg.textFilterRules
        : DEFAULT_FILTER_RULES;
}

export function saveVectorConfig(vectorCfg) {
    try {
        const parsed = ensureSummaryPanelConfigCache();
        parsed.vector = normalizeVectorConfig(vectorCfg || null);
        setSummaryPanelConfigCache(parsed);
        CommonSettingStorage.set(SUMMARY_CONFIG_KEY, parsed);
        return cloneConfig(parsed.vector);
    } catch (e) {
        xbLog.error(MODULE_ID, "保存向量配置失败", e);
        return null;
    }
}

export async function saveSummaryPanelConfigVerified(config) {
    const normalized = normalizeSummaryPanelConfig(config);
    await CommonSettingStorage.setAndSave(SUMMARY_CONFIG_KEY, normalized, {
        silent: false,
    });
    CommonSettingStorage.clearCache();
    const savedConfig = await CommonSettingStorage.get(
        SUMMARY_CONFIG_KEY,
        null,
    );
    const savedNormalized = normalizeSummaryPanelConfig(savedConfig);
    assertSummaryConfigPersisted(normalized, savedNormalized);
    setSummaryPanelConfigCache(savedNormalized);
    return cloneConfig(savedNormalized);
}

export async function loadConfigFromServer() {
    try {
        const savedConfig = await CommonSettingStorage.get(
            SUMMARY_CONFIG_KEY,
            null,
        );
        if (savedConfig) {
            const normalized = setSummaryPanelConfigCache(savedConfig);
            xbLog.info(MODULE_ID, "已从服务端加载面板配置");
            return cloneConfig(normalized);
        }
    } catch (e) {
        xbLog.warn(MODULE_ID, "加载面板配置失败", e);
    }
    return getSummaryPanelConfig();
}
