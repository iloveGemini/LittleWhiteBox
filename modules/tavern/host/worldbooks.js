/* eslint-disable -- generated from TypeScript source; run npm run build:tavern */
import {
  chat_metadata,
  eventSource,
  name2,
  setCharacterId,
  setCharacterName,
  this_chid
} from "../../../../../../../script.js";
import { getContext } from "../../../../../../extensions.js";
import { power_user } from "../../../../../../power-user.js";
import {
  checkWorldInfo,
  getWorldInfoSettings,
  loadWorldInfo,
  METADATA_KEY,
  openWorldInfoEditor,
  selected_world_info,
  updateWorldInfoList,
  world_names
} from "../../../../../../world-info.js";
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizeText(value = "") {
  return String(value || "").trim();
}
function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}
function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}
function readWorldbookEntries(data) {
  const entries = asRecord(data).entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return [];
  }
  return Object.values(entries).map((entry) => asRecord(entry)).filter((entry) => Object.keys(entry).length > 0);
}
function previewEntryName(entry, index) {
  return normalizeText(entry.comment) || normalizeText(entry.name) || normalizeText(entry.title) || `\u6761\u76EE ${index + 1}`;
}
function readHistoryMessages(context = {}) {
  return Array.isArray(context.history) ? context.history : [];
}
function ensureTimedBucket(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result = {};
  Object.entries(value).forEach(([key, item]) => {
    if (!key || !item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }
    const source = item;
    const normalized = {};
    const hash = Number(source.hash);
    const start = Number(source.start);
    const end = Number(source.end);
    if (Number.isFinite(hash)) {
      normalized.hash = hash;
    }
    if (Number.isFinite(start)) {
      normalized.start = start;
    }
    if (Number.isFinite(end)) {
      normalized.end = end;
    }
    if (source.protected === true) {
      normalized.protected = true;
    }
    if (Object.keys(normalized).length) {
      result[key] = normalized;
    }
  });
  return result;
}
function normalizeTimedState(value) {
  const source = asRecord(value);
  return {
    sticky: ensureTimedBucket(source.sticky),
    cooldown: ensureTimedBucket(source.cooldown)
  };
}
function valuesToRecordList(value) {
  if (!value || typeof value !== "object") {
    return [];
  }
  const maybeValues = value.values;
  if (typeof maybeValues !== "function") {
    return [];
  }
  return Array.from(maybeValues.call(value)).map((entry) => asRecord(entry)).filter((entry) => Object.keys(entry).length > 0);
}
function replaceSelectedWorldInfo(names = []) {
  if (!Array.isArray(selected_world_info)) {
    return;
  }
  selected_world_info.splice(0, selected_world_info.length, ...names);
}
function collectGlobalWorldbookNames(context = {}) {
  const sessionMeta = asRecord(context.sessionMeta);
  const worldbookSources = Array.isArray(sessionMeta.worldbookSources) ? sessionMeta.worldbookSources : [];
  return worldbookSources.filter((source) => normalizeText(asRecord(source).sourceType) === "global").map((source) => normalizeText(asRecord(source).name)).filter(Boolean);
}
function dedupeSources(sources = []) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  sources.forEach((source, index) => {
    const name = normalizeText(source.name);
    if (!name || seen.has(name)) {
      return;
    }
    seen.add(name);
    result.push({
      name,
      ...source.sourceType ? { sourceType: source.sourceType } : {},
      ...Number.isFinite(Number(source.sourceIndex)) ? { sourceIndex: Number(source.sourceIndex) } : { sourceIndex: index }
    });
  });
  return result;
}
function isNativeRuntimeSource(source = { name: "" }) {
  return normalizeText(source.sourceType) !== "embedded";
}
function collectRuntimeSources(context = {}) {
  const sessionMeta = asRecord(context.sessionMeta);
  const metaSources = Array.isArray(sessionMeta.worldbookSources) ? sessionMeta.worldbookSources.map((source, index) => {
    const record = asRecord(source);
    return {
      name: normalizeText(record.name),
      sourceType: normalizeText(record.sourceType),
      sourceIndex: Number.isFinite(Number(record.sourceIndex)) ? Number(record.sourceIndex) : index
    };
  }) : [];
  const legacyMetaSources = !metaSources.length && Array.isArray(sessionMeta.worldbookNames) ? sessionMeta.worldbookNames.map((name, index) => ({
    name: normalizeText(name),
    sourceType: "global",
    sourceIndex: index
  })) : [];
  const bookSources = Array.isArray(context.worldBooks) ? context.worldBooks.map((book, index) => ({
    name: normalizeText(book.name),
    sourceType: normalizeText(book.worldSourceType),
    sourceIndex: Number.isFinite(Number(book.worldSourceIndex)) ? Number(book.worldSourceIndex) : index
  })) : [];
  return dedupeSources([...metaSources, ...legacyMetaSources, ...bookSources]).filter((source) => isNativeRuntimeSource(source));
}
function buildHistoryScanLines(context = {}, currentUserMessage = "", includeNames = false) {
  const userName = normalizeText(context.user?.name) || "User";
  const characterName = normalizeText(context.character?.name) || "Assistant";
  const lines = readHistoryMessages(context).filter((message) => ["user", "assistant"].includes(normalizeText(message.role))).map((message) => {
    const role = normalizeText(message.role) === "user" || message.is_user === true ? "user" : "assistant";
    const content = normalizeText(message.content || message.mes || message.message);
    if (!content) {
      return "";
    }
    if (!includeNames) {
      return content;
    }
    const speaker = role === "user" ? normalizeText(message.name) || userName : normalizeText(message.name) || characterName;
    return `${speaker}: ${content}`;
  }).filter(Boolean);
  const current = normalizeText(currentUserMessage);
  if (current) {
    lines.push(includeNames ? `${userName}: ${current}` : current);
  }
  return lines.reverse();
}
function buildGlobalScanData(input = {}) {
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
    trigger: normalizeText(input.trigger || context.worldSettings?.trigger) || "normal"
  };
}
function describeActivationReason(entry) {
  if (entry.constant === true) {
    return "constant";
  }
  return "native";
}
function normalizePromptEntryRole(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return 0;
}
function buildActivatedPromptEntries(entries, sources) {
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
      delayUntilRecursion: entry.delayUntilRecursion,
      characterFilter: cloneJson(entry.characterFilter),
      group: normalizeText(entry.group),
      groupOverride: entry.groupOverride === true,
      groupWeight: Number.isFinite(Number(entry.groupWeight)) ? Number(entry.groupWeight) : void 0,
      useGroupScoring: typeof entry.useGroupScoring === "boolean" ? entry.useGroupScoring : null,
      matchPersonaDescription: entry.matchPersonaDescription === true,
      matchCharacterDescription: entry.matchCharacterDescription === true,
      matchCharacterPersonality: entry.matchCharacterPersonality === true,
      matchCharacterDepthPrompt: entry.matchCharacterDepthPrompt === true,
      matchScenario: entry.matchScenario === true,
      matchCreatorNotes: entry.matchCreatorNotes === true,
      probability: Number.isFinite(Number(entry.probability)) ? Number(entry.probability) : void 0,
      useProbability: entry.useProbability !== false,
      sticky: entry.sticky,
      cooldown: Number.isFinite(Number(entry.cooldown)) ? Number(entry.cooldown) : void 0,
      delay: Number.isFinite(Number(entry.delay)) ? Number(entry.delay) : void 0,
      triggers: normalizeStringList(entry.triggers),
      outletName: normalizeText(entry.outletName),
      sourceWorldBook,
      worldSourceType: source?.sourceType,
      worldSourceIndex: source?.sourceIndex,
      extensions: {
        nativeActivationReason: describeActivationReason(entry)
      },
      activationReason: describeActivationReason(entry)
    };
  }).filter((entry) => !!normalizeText(entry.content));
}
function captureRuntimeState() {
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
    emit: eventSource?.emit
  };
}
function applyRuntimeState(input) {
  const globalNames = input.sources.filter((source) => source.sourceType === "global").map((source) => normalizeText(source.name)).filter(Boolean);
  replaceSelectedWorldInfo(globalNames);
  const chatLore = input.sources.find((source) => source.sourceType === "chat")?.name || "";
  const personaLore = input.sources.find((source) => source.sourceType === "persona")?.name || "";
  if (chatLore) {
    chat_metadata[METADATA_KEY] = chatLore;
  } else {
    delete chat_metadata[METADATA_KEY];
  }
  power_user.persona_description_lorebook = personaLore || "";
  setCharacterId(normalizeText(input.context.character?.id) || void 0);
  if (normalizeText(input.context.character?.name)) {
    setCharacterName(normalizeText(input.context.character?.name));
  }
  chat_metadata.timedWorldInfo = cloneJson(normalizeTimedState(input.timedState));
  if (eventSource && typeof eventSource.emit === "function") {
    eventSource.emit = async () => void 0;
  }
}
function restoreRuntimeState(snapshot) {
  replaceSelectedWorldInfo(snapshot.selectedWorldInfo);
  if (snapshot.chatLore) {
    chat_metadata[METADATA_KEY] = snapshot.chatLore;
  } else {
    delete chat_metadata[METADATA_KEY];
  }
  power_user.persona_description_lorebook = snapshot.personaLore || "";
  setCharacterId(snapshot.characterId || void 0);
  setCharacterName(snapshot.characterName || "");
  chat_metadata.timedWorldInfo = cloneJson(snapshot.timedState);
  const context = asRecord(getContext?.() || {});
  const extensionPrompts = asRecord(context.extensionPrompts);
  if (snapshot.authorNote !== void 0) {
    extensionPrompts.note = cloneJson(snapshot.authorNote);
  }
  if (eventSource) {
    eventSource.emit = snapshot.emit;
  }
}
async function ensureWorldbookNames() {
  if (!Array.isArray(world_names) || !world_names.length) {
    await updateWorldInfoList();
  }
  return Array.isArray(world_names) ? [...world_names] : [];
}
async function listTavernWorldbookSources(input = {}) {
  const payload = asRecord(input);
  const context = asRecord(payload.context);
  const requestedContext = Object.keys(context).length ? context : void 0;
  const names = await ensureWorldbookNames();
  const sourceContext = requestedContext || {};
  const globalNameSet = new Set(collectGlobalWorldbookNames(sourceContext));
  return {
    books: names.map((name) => ({
      name,
      globalActive: globalNameSet.has(name)
    }))
  };
}
async function getTavernWorldbookPreview(input = {}) {
  const payload = asRecord(input);
  const name = normalizeText(payload.name);
  if (!name) {
    throw new Error("\u7F3A\u5C11\u4E16\u754C\u4E66\u540D\u79F0\u3002");
  }
  const names = await ensureWorldbookNames();
  if (!names.includes(name)) {
    throw new Error(`\u627E\u4E0D\u5230\u4E16\u754C\u4E66\uFF1A${name}`);
  }
  const data = await loadWorldInfo(name);
  const entries = readWorldbookEntries(data);
  const limit = Math.max(1, Math.floor(Number(payload.limit) || 24));
  const previewEntries = entries.map((entry, index) => {
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
      order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 100
    };
  }).sort((a, b) => Number(b.order) - Number(a.order)).slice(0, limit);
  return {
    name,
    entryCount: entries.length,
    enabledCount: entries.filter((entry) => entry.disable !== true).length,
    constantCount: entries.filter((entry) => entry.constant === true).length,
    disabledCount: entries.filter((entry) => entry.disable === true).length,
    keywordCount: entries.reduce((sum, entry) => sum + normalizeStringList(entry.key).length + normalizeStringList(entry.keysecondary || entry.secondary_keys).length, 0),
    totalChars: entries.reduce((sum, entry) => sum + normalizeText(entry.content).length, 0),
    entries: previewEntries
  };
}
async function getTavernWorldbookRuntime(input = {}) {
  const payload = asRecord(input);
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
    timedState: normalizeTimedState(payload.timedState)
  });
  try {
    const activated = await checkWorldInfo(chatLines, maxContext, false, globalScanData);
    const activatedPromptEntries = buildActivatedPromptEntries(
      valuesToRecordList(activated.allActivatedEntries),
      sources
    );
    return {
      trigger: normalizeText(globalScanData.trigger),
      sourceNames: sources,
      activatedEntries: activatedPromptEntries,
      worldInfoBefore: normalizeText(activated.worldInfoBefore),
      worldInfoAfter: normalizeText(activated.worldInfoAfter),
      worldInfoExamples: Array.isArray(activated.EMEntries) ? activated.EMEntries.map((entry) => ({
        position: normalizeText(asRecord(entry).position),
        content: normalizeText(asRecord(entry).content)
      })).filter((entry) => entry.content) : [],
      worldInfoDepth: Array.isArray(activated.WIDepthEntries) ? activated.WIDepthEntries.map((entry) => ({
        depth: Number(asRecord(entry).depth),
        role: Number(asRecord(entry).role),
        entries: normalizeStringList(asRecord(entry).entries)
      })).filter((entry) => Array.isArray(entry.entries) && entry.entries.length) : [],
      anBefore: normalizeStringList(activated.ANBeforeEntries),
      anAfter: normalizeStringList(activated.ANAfterEntries),
      outlets: Object.fromEntries(
        Object.entries(asRecord(activated.outletEntries)).map(([key, value]) => [key, normalizeStringList(value)]).filter(([, value]) => value.length)
      ),
      timedState: normalizeTimedState(chat_metadata?.timedWorldInfo)
    };
  } finally {
    restoreRuntimeState(snapshot);
  }
}
function openTavernWorldbookEditor(input = {}) {
  const name = normalizeText(asRecord(input).name);
  if (!name) {
    throw new Error("\u7F3A\u5C11\u4E16\u754C\u4E66\u540D\u79F0\u3002");
  }
  openWorldInfoEditor(name);
  return {
    ok: true,
    name
  };
}
export {
  getTavernWorldbookPreview,
  getTavernWorldbookRuntime,
  listTavernWorldbookSources,
  openTavernWorldbookEditor
};
