import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

function readRepoFile(path: string): string {
    return readFileSync(resolve(root, path), 'utf8');
}

test('tavern host build script compiles every host module imported by tavern.ts', () => {
    const tavernSource = readRepoFile('modules/tavern/tavern.ts');
    const buildSource = readRepoFile('scripts/build-tavern-host.mjs');
    const hostImports = [...tavernSource.matchAll(/from ['"]\.\/host\/([^'"]+)\.js['"]/g)]
        .map((match) => `modules/tavern/host/${match[1]}.ts`)
        .sort();
    const entryPoints = [...buildSource.matchAll(/['"](modules\/tavern\/host\/[^'"]+\.ts)['"]/g)]
        .map((match) => match[1])
        .sort();

    assert.deepEqual(
        hostImports.filter((path) => !entryPoints.includes(path)),
        [],
    );
});

test('tavern host replies sanitize payload before postMessage', () => {
    const tavernSource = readRepoFile('modules/tavern/tavern.ts');
    assert.match(tavernSource, /function cloneFramePayload/);
    assert.match(tavernSource, /const message = cloneFramePayload\(\{ type, payload \}\);/);
});

test('tavern host can return a fresh live context on demand', () => {
    const tavernSource = readRepoFile('modules/tavern/tavern.ts');
    const appSource = readRepoFile('modules/tavern/app-src/App.vue');
    assert.match(tavernSource, /async function handleContextRequest/);
    assert.match(tavernSource, /case 'xb-tavern:get-context':/);
    assert.match(appSource, /requestHost\('xb-tavern:get-context'/);
});

test('tavern app requests sanitize payload before postMessage', () => {
    const appSource = readRepoFile('modules/tavern/app-src/App.vue');
    assert.match(appSource, /function clonePostMessagePayload/);
    assert.match(appSource, /const safePayload = clonePostMessagePayload\(payload\);/);
});

test('tavern worldbook settings page is a native overview instead of a custom editor', () => {
    const panelSource = readRepoFile('modules/tavern/app-src/components/settings/TavernWorldbooksSettingsPanel.vue');
    assert.match(panelSource, /打开酒馆编辑器/);
    assert.match(panelSource, /worldbook-entry-preview-list/);
    assert.match(panelSource, /showMoreWorldbookPreviewEntries/);
    assert.match(panelSource, /worldbookPreview\.entryCount/);
    assert.doesNotMatch(panelSource, /酒馆世界书/);
    assert.doesNotMatch(panelSource, /xb-tavern:save-worldbook/);
    assert.doesNotMatch(panelSource, /xb-tavern:create-worldbook-entry/);
    assert.doesNotMatch(panelSource, /xb-tavern:save-worldbook-settings/);
    assert.doesNotMatch(panelSource, /xb-tavern:set-worldbook-active/);
});

test('tavern character select page keeps a dense index and selected-card preview', () => {
    const panelSource = readRepoFile('modules/tavern/app-src/components/TavernCharacterSelectPage.vue');
    const layoutCss = readRepoFile('modules/tavern/app-src/styles/characters/layout.css');
    const cardsCss = readRepoFile('modules/tavern/app-src/styles/characters/cards.css');
    const previewCss = readRepoFile('modules/tavern/app-src/styles/characters/preview.css');
    const appSource = readRepoFile('modules/tavern/app-src/App.vue');
    assert.match(panelSource, /class="character-index-panel"/);
    assert.match(panelSource, /character-preview-panel dossier-view/);
    assert.match(panelSource, /class="character-preview-panel dossier-empty"/);
    assert.match(panelSource, /class="os-search-bar"/);
    assert.match(panelSource, /class="card-focus-indicator"/);
    assert.match(panelSource, /class="dossier-header"/);
    assert.match(panelSource, /class="greeting-choice-list"/);
    assert.match(panelSource, /备用 \$\{index\}/);
    assert.match(cardsCss, /content-visibility: auto/);
    assert.match(layoutCss, /width: 360px/);
    assert.match(previewCss, /\.dossier-header/);
    assert.match(appSource, /activeView === 'home' \|\| activeView === 'about'/);
    assert.match(appSource, /const previewId = String\(selectedCharacterPreviewId\.value \|\| ''\)\.trim\(\);/);
    assert.doesNotMatch(panelSource, /刷新列表/);
    assert.doesNotMatch(panelSource, /这里不重写角色卡/);
    assert.doesNotMatch(panelSource, /archive-toolbar/);
    assert.doesNotMatch(panelSource, /character-archive-browser/);
    assert.doesNotMatch(layoutCss, /linear-gradient\(90deg, transparent 50%, var\(--xb-theme-split-bg\) 50%\)/);
});

test('tavern worldbook sync uses native source overview with current context', () => {
    const appSource = readRepoFile('modules/tavern/app-src/App.vue');
    assert.match(
        appSource,
        /requestHost\('xb-tavern:list-worldbook-sources', \{\s*payload: \{\s*context: effectiveContext\.value,/,
    );
    assert.match(appSource, /requestHost\('xb-tavern:get-worldbook-preview'/);
    assert.match(appSource, /limit: worldbookPreviewVisibleLimit\.value/);
    assert.match(appSource, /function showMoreWorldbookPreviewEntries/);
    assert.match(appSource, /async function openSelectedWorldbookEditor/);
    assert.match(appSource, /requestHost\('xb-tavern:open-worldbook-editor'/);
    assert.match(appSource, /postToHost\('xb-tavern:close'\)/);
});

test('tavern worldbook host bridge exposes native runtime result instead of edit endpoints', () => {
    const hostSource = readRepoFile('modules/tavern/host/worldbooks.ts');
    const tavernSource = readRepoFile('modules/tavern/tavern.ts');
    assert.match(hostSource, /export async function listTavernWorldbookSources/);
    assert.match(hostSource, /export async function getTavernWorldbookPreview/);
    assert.match(hostSource, /await loadWorldInfo\(name\)/);
    assert.match(hostSource, /Number\(payload\.limit\)/);
    assert.match(hostSource, /export async function getTavernWorldbookRuntime/);
    assert.match(hostSource, /export function openTavernWorldbookEditor/);
    assert.match(hostSource, /await checkWorldInfo\(chatLines, maxContext, false, globalScanData\)/);
    assert.match(hostSource, /worldInfoBefore:/);
    assert.match(hostSource, /worldInfoAfter:/);
    assert.match(hostSource, /worldInfoExamples:/);
    assert.match(hostSource, /worldInfoDepth:/);
    assert.match(hostSource, /anBefore:/);
    assert.match(hostSource, /anAfter:/);
    assert.match(hostSource, /outlets:/);
    assert.match(tavernSource, /case 'xb-tavern:list-worldbook-sources':/);
    assert.match(tavernSource, /case 'xb-tavern:get-worldbook-preview':/);
    assert.match(tavernSource, /case 'xb-tavern:get-worldbook-runtime':/);
    assert.match(tavernSource, /case 'xb-tavern:open-worldbook-editor':/);
    assert.doesNotMatch(tavernSource, /case 'xb-tavern:list-worldbooks':/);
    assert.doesNotMatch(tavernSource, /case 'xb-tavern:get-worldbook':/);
    assert.doesNotMatch(tavernSource, /case 'xb-tavern:save-worldbook':/);
});

test('tavern message assembler can render native worldbook prompt blocks directly', () => {
    const assemblerSource = readRepoFile('modules/tavern/shared/message-assembler.ts');
    assert.match(assemblerSource, /function buildNativePromptEntries/);
    assert.match(assemblerSource, /worldInfoBefore\?: string;/);
    assert.match(assemblerSource, /worldInfoAfter\?: string;/);
    assert.match(assemblerSource, /worldInfoExamples\?: Array/);
    assert.match(assemblerSource, /worldInfoDepth\?: Array/);
    assert.match(assemblerSource, /anBefore\?: string\[\];/);
    assert.match(assemblerSource, /anAfter\?: string\[\];/);
    assert.match(assemblerSource, /outlets\?: Record<string, string\[\]>;/);
    assert.match(assemblerSource, /activatedWorldEntries: nativePromptEntries\.length \? nativePromptEntries : nativeActivatedEntries/);
});
