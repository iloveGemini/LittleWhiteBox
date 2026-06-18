import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preprocessTavernRoleplayMarkdown } from '../app-src/components/chat/useTavernMarkdownTools';

test('roleplay markdown only substitutes display macros before shared ST-style sanitization', () => {
    const text = [
        '<maintext>',
        '办公楼下的旋转门不知疲倦地转动着。',
        '<user>走出大门，一眼就看到了<CHAR>。',
        '</maintext><Status_block>',
        '<details><summary>[角色状态]</summary>',
        '```',
        '- 👨 <user>的状态',
        '```',
        '</details>',
        '</Status_block>',
    ].join('\n');

    const rendered = preprocessTavernRoleplayMarkdown(text, {
        userName: '林舟',
        characterName: '许知夏',
    });

    assert.match(rendered, /<maintext>/i);
    assert.match(rendered, /<\/maintext><Status_block>/i);
    assert.match(rendered, /<\/Status_block>/i);
    assert.match(rendered, /办公楼下的旋转门/);
    assert.match(rendered, /林舟走出大门，一眼就看到了许知夏。/);
    assert.match(rendered, /<details><summary>\[角色状态\]<\/summary>/);
    assert.match(rendered, /```\n- 👨 林舟的状态\n```/);
});

test('roleplay markdown keeps fenced HTML renderable after macro substitution', () => {
    const rendered = preprocessTavernRoleplayMarkdown([
        '界面如下：',
        '```html',
        '<main><h1><user> / <bot></h1><section>内容</section></main>',
        '```',
    ].join('\n'), {
        userName: '林舟',
        characterName: '许知夏',
    });

    assert.match(rendered, /界面如下：/);
    assert.match(rendered, /```html\n<main><h1>林舟 \/ 许知夏<\/h1><section>内容<\/section><\/main>\n```/);
});
