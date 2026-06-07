/* eslint-disable -- generated from TypeScript source; run npm run build:tavern */
import { saveSettingsDebounced } from "../../../../../../../script.js";
import { getPresetManager } from "../../../../../../preset-manager.js";
import { promptManager } from "../../../../../../openai.js";
function createFallbackTavernChatPromptPresetBundle() {
  return {
    id: "sillytavern-current-chat-prompt",
    name: "\u9152\u9986\u5F53\u524D\u804A\u5929\u9884\u8BBE",
    source: "sillytavern",
    selected: true,
    sections: []
  };
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}
function normalizeText(value = "") {
  return String(value || "").trim();
}
function normalizeTavernChatPromptPresetBundle(input = {}) {
  const fallback = createFallbackTavernChatPromptPresetBundle();
  return {
    id: normalizeText(input.id) || fallback.id,
    name: normalizeText(input.name) || fallback.name,
    source: normalizeText(input.source) || "sillytavern",
    selected: input.selected !== false,
    promptManager: input.promptManager,
    systemPrompt: input.systemPrompt,
    contextTemplate: input.contextTemplate,
    instructTemplate: input.instructTemplate,
    sections: Array.isArray(input.sections) ? input.sections.filter((section) => normalizeText(section.content) || section.marker === true) : [],
    updatedAt: Number(input.updatedAt) || void 0
  };
}
function normalizePromptRole(value) {
  const role = normalizeText(value).toLowerCase();
  return role === "user" || role === "assistant" ? role : "system";
}
function resolvePromptPlacement(prompt) {
  const identifier = normalizeText(prompt.identifier || prompt.id).toLowerCase();
  if (identifier === "jailbreak") {
    return "afterHistory";
  }
  const injectionPosition = Number(prompt.injection_position);
  if (Number.isFinite(injectionPosition) && injectionPosition > 0) {
    return "afterHistory";
  }
  const position = normalizeText(prompt.position).toLowerCase();
  if (position.includes("after")) {
    return "afterHistory";
  }
  if (position.includes("depth") || Number.isFinite(Number(prompt.injection_depth))) {
    return "beforeHistory";
  }
  return "beforeHistory";
}
function getPreparedPromptManagerPrompts() {
  const collection = promptManager?.getPromptCollection?.("normal");
  const prompts = asArray(asRecord(collection).collection);
  return prompts.length ? prompts : asArray(asRecord(promptManager?.serviceSettings).prompts);
}
function buildPromptManagerSections(prompts = []) {
  const sections = [];
  prompts.forEach((item, index) => {
    const prompt = asRecord(item);
    const content = normalizeText(prompt.content);
    const marker = prompt.marker === true;
    if (!content && !marker || prompt.enabled === false || prompt.disabled === true) {
      return;
    }
    const identifier = normalizeText(prompt.identifier || prompt.id || `prompt-${index + 1}`);
    sections.push({
      id: `prompt-manager:${identifier}`,
      label: normalizeText(prompt.name || prompt.label || identifier),
      enabled: true,
      marker,
      role: normalizePromptRole(prompt.role),
      content,
      placement: resolvePromptPlacement(prompt),
      source: "promptManager"
    });
  });
  return sections;
}
function getSelectedPromptManagerPreset() {
  const manager = getPresetManager("openai");
  const promptPresetName = normalizeText(manager?.getSelectedPresetName?.());
  const preset = asRecord(manager?.getCompletionPresetByName?.(promptPresetName));
  return Object.keys(preset).length ? cloneJson(preset) : cloneJson(asRecord(promptManager?.serviceSettings));
}
function getActivePromptManagerCharacterId() {
  const runtime = promptManager;
  return normalizeText(asRecord(runtime?.activeCharacter).id);
}
function replaceActivePromptOrder(existingPromptOrder, activeCharacterId, nextOrder = []) {
  const containers = asArray(existingPromptOrder).map((container) => ({ ...asRecord(container) }));
  const targetIndex = containers.findIndex((container) => normalizeText(container.character_id) === activeCharacterId);
  const target = targetIndex >= 0 ? containers[targetIndex] : { character_id: activeCharacterId };
  const replacement = {
    ...target,
    character_id: target?.character_id ?? activeCharacterId,
    order: cloneJson(nextOrder)
  };
  if (targetIndex >= 0) {
    containers[targetIndex] = replacement;
  } else {
    containers.push(replacement);
  }
  return containers;
}
function pickPromptManagerRuntimeFields(source = {}) {
  const result = {};
  if (Array.isArray(source.prompts)) {
    result.prompts = cloneJson(source.prompts);
  }
  if (Array.isArray(source.prompt_order)) {
    result.prompt_order = cloneJson(source.prompt_order);
  }
  return result;
}
function setPromptManagerSelectedPresetName(name = "") {
  const manager = getPresetManager("openai");
  const presetName = normalizeText(name);
  if (!manager || !presetName) {
    return;
  }
  const value = manager.findPreset?.(presetName);
  if (value === void 0 || value === null) {
    return;
  }
  try {
    manager.select?.val?.(value);
  } catch {
  }
}
function buildCurrentBundle() {
  const promptSettings = asRecord(promptManager?.serviceSettings);
  const promptPresetName = normalizeText(getPresetManager("openai")?.getSelectedPresetName?.());
  const rawPreset = getSelectedPromptManagerPreset();
  const promptManagerRuntime = promptManager;
  const activeCharacter = asRecord(promptManagerRuntime?.activeCharacter);
  const activeCharacterId = activeCharacter.id;
  const activeOrder = Array.isArray(promptManagerRuntime?.getPromptOrderForCharacter?.(promptManagerRuntime.activeCharacter)) ? promptManagerRuntime.getPromptOrderForCharacter(promptManagerRuntime.activeCharacter) : [];
  const sections = [
    ...buildPromptManagerSections(getPreparedPromptManagerPrompts())
  ];
  return normalizeTavernChatPromptPresetBundle({
    id: promptPresetName || createFallbackTavernChatPromptPresetBundle().id,
    name: promptPresetName || createFallbackTavernChatPromptPresetBundle().name,
    source: "sillytavern",
    selected: true,
    promptManager: {
      name: promptPresetName,
      prompts: cloneJson(asArray(rawPreset.prompts).length ? asArray(rawPreset.prompts) : asArray(promptSettings.prompts)),
      promptOrder: cloneJson("prompt_order" in rawPreset ? rawPreset.prompt_order : promptSettings.prompt_order),
      rawPreset,
      activeCharacterId,
      activeOrder: cloneJson(activeOrder)
    },
    sections,
    updatedAt: Date.now()
  });
}
function getComponentNames() {
  return {
    promptManager: getPresetManager("openai")?.getAllPresets?.() || []
  };
}
function listTavernChatPresetBundles() {
  const active = buildCurrentBundle();
  return {
    active,
    bundles: [active],
    components: getComponentNames()
  };
}
function getTavernChatPresetBundle() {
  return buildCurrentBundle();
}
async function savePromptManagerPreset(bundle) {
  const manager = getPresetManager("openai");
  const name = normalizeText(bundle.promptManager?.name);
  if (!manager || !name) {
    return;
  }
  const selectedName = normalizeText(manager.getSelectedPresetName?.());
  if (selectedName && selectedName !== name) {
    throw new Error("\u9152\u9986\u5F53\u524D\u9884\u8BBE\u5DF2\u5207\u6362\uFF0C\u8BF7\u5237\u65B0\u540E\u518D\u4FDD\u5B58\u3002");
  }
  const existing = cloneJson(manager.getCompletionPresetByName?.(name) || {});
  if (!Object.keys(asRecord(existing)).length) {
    throw new Error(`\u804A\u5929\u9884\u8BBE\u4E0D\u5B58\u5728\uFF1A${name}`);
  }
  const currentActiveCharacterId = getActivePromptManagerCharacterId();
  const submittedActiveCharacterId = normalizeText(bundle.promptManager?.activeCharacterId);
  if (!currentActiveCharacterId || !submittedActiveCharacterId || currentActiveCharacterId !== submittedActiveCharacterId) {
    throw new Error("\u672A\u53D6\u5F97\u5F53\u524D\u89D2\u8272\u987A\u5E8F\uFF0C\u8BF7\u5237\u65B0\u540E\u518D\u4FDD\u5B58\u3002");
  }
  const patch = { ...asRecord(existing) };
  if (Array.isArray(bundle.promptManager?.prompts)) {
    patch.prompts = cloneJson(bundle.promptManager.prompts);
  }
  if (Array.isArray(bundle.promptManager?.activeOrder)) {
    patch.prompt_order = replaceActivePromptOrder(
      asRecord(existing).prompt_order,
      currentActiveCharacterId,
      bundle.promptManager.activeOrder
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
function applyPromptManagerPromptFieldsFromPreset(name = "") {
  const manager = getPresetManager("openai");
  const presetName = normalizeText(name);
  if (!manager || !presetName) {
    return false;
  }
  const preset = asRecord(manager.getCompletionPresetByName?.(presetName));
  if (!Object.keys(preset).length) {
    return false;
  }
  if (promptManager?.serviceSettings) {
    const promptFields = pickPromptManagerRuntimeFields(preset);
    if (!Object.keys(promptFields).length) {
      return false;
    }
    Object.assign(promptManager.serviceSettings, promptFields);
  }
  setPromptManagerSelectedPresetName(presetName);
  promptManager?.saveServiceSettings?.();
  promptManager?.render?.(false);
  return true;
}
async function saveTavernChatPresetBundle(input) {
  const bundle = normalizeTavernChatPromptPresetBundle(asRecord(input));
  await savePromptManagerPreset(bundle);
  saveSettingsDebounced?.();
  return buildCurrentBundle();
}
async function selectTavernChatPresetBundle(input) {
  const source = asRecord(input);
  const promptManagerName = normalizeText(source.promptManagerName || source.name);
  if (promptManagerName) {
    applyPromptManagerPromptFieldsFromPreset(promptManagerName);
  }
  saveSettingsDebounced?.();
  return buildCurrentBundle();
}
export {
  getTavernChatPresetBundle,
  listTavernChatPresetBundles,
  saveTavernChatPresetBundle,
  selectTavernChatPresetBundle
};
