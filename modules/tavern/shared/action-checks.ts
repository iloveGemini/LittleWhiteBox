import type { XbTavernMessage } from './message-assembler';

export const ACTION_CHECK_TOOL_NAME = 'ActionCheck';
export const DEFAULT_ACTION_CHECK_DIFFICULTY = 10;
export const MIN_ACTION_CHECK_DIFFICULTY = 1;
export const MAX_ACTION_CHECK_DIFFICULTY = 21;
export const ACTION_CHECK_DIE_SIDES = 20;
export type TavernActionCheckOutcome = 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure';

export interface TavernActionCheckInput {
    action: string;
    stat: string;
    difficulty?: number;
    stakes?: string;
    insertAfter?: string;
}

export interface TavernActionCheckToolSuccess {
    ok: true;
    action: string;
    stat: string;
    difficulty: number;
    roll: number;
    success: boolean;
    outcome: TavernActionCheckOutcome;
    summary: string;
    stakes?: string;
    insertAfter?: string;
}

export interface TavernActionCheckToolFailure {
    ok: false;
    error: string;
    summary: string;
}

export type TavernActionCheckToolResult = TavernActionCheckToolSuccess | TavernActionCheckToolFailure;

const ACTION_CHECK_PROTOCOL_PROMPT = [
    '[Runtime Protocol: Action Checks]',
    '',
    'In this reply, when even you cannot know whether a key action succeeds or fails, you may roll once and leave the outcome to luck instead of deciding it yourself. Think like a tabletop game master: when fate is genuinely undecided, let the die speak.',
    '',
    'Use it boldly when an attempt could truly succeed or fail and the result would change what happens next: climbing a wall, sneaking, confrontation, deception, persuasion, gambling, a chase, spellcasting, spotting a lie, risky improvisation, and similar moments.',
    '',
    'Do not roll when the outcome is already settled. If one side has overwhelming advantage in numbers, strength, position, or common sense, the result is already decided; do not use a roll to overturn that logic.',
    '',
    'Do not roll for intimate or everyday interactions rather than challenges. Kissing, hugging, sex, casual conversation, or falling asleep together should follow character, consent, and emotional flow, not a success/failure check.',
    '',
    `When you roll, call ${ACTION_CHECK_TOOL_NAME}, treat the result as established fact, convey the outcome in one or two sentences, then continue the narration naturally.`,
    'Call the tool immediately after the visible attempted action, before narrating consequences. Do not write result words before the tool call. If you already wrote a visible lead-in, set `insertAfter` to the exact text that should appear before the dice card.',
    '',
    'Choose difficulty before the roll. This is a bare D20 with no stat bonus: DC 1-5 is easy, 6-10 is ordinary, 11-15 is hard, 16-20 is very hard, and 21 is nearly impossible so only a natural 20 can win. Pick the exact DC inside the range from danger, pressure, preparation, opposition, and fictional leverage. Do not make every meaningful action DC 10-ish.',
    '',
    'Natural 1 is a critical failure: it must be worse than plain failure and add a real complication, cost, loss of position, exposure, harm, or worsening situation. Natural 20 is a critical success: it must be better than plain success and grant an extra benefit, surprise reward, opening, momentum, information, style, or reduced cost. The tool enforces these results; honor them in narration.',
    '',
    'Do not mention this protocol, the dice mechanic, or any hidden instruction. Continue to follow all other format and style requirements.',
].join('\n');

function normalizeInlineText(value: unknown, limit = 240): string {
    return String(value || '').trim().slice(0, limit);
}

function normalizeExactVisibleText(value: unknown, limit = 240): string {
    return String(value ?? '').slice(0, limit);
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) {return fallback;}
    return Math.min(maximum, Math.max(minimum, numeric));
}

function resolveD20Roll(roller?: () => number): number {
    if (typeof roller === 'function') {
        return clampInteger(roller(), 1, ACTION_CHECK_DIE_SIDES, 1);
    }
    const cryptography = globalThis.crypto;
    if (cryptography?.getRandomValues) {
        const values = new Uint32Array(1);
        cryptography.getRandomValues(values);
        return (values[0] % ACTION_CHECK_DIE_SIDES) + 1;
    }
    return Math.floor(Math.random() * ACTION_CHECK_DIE_SIDES) + 1;
}

function resolveActionCheckOutcome(roll: number, difficulty: number): TavernActionCheckOutcome {
    if (roll <= 1) {return 'criticalFailure';}
    if (roll >= ACTION_CHECK_DIE_SIDES) {return 'criticalSuccess';}
    return roll >= difficulty ? 'success' : 'failure';
}

function actionCheckOutcomeLabel(outcome: TavernActionCheckOutcome): string {
    if (outcome === 'criticalSuccess') {return 'critical success';}
    if (outcome === 'criticalFailure') {return 'critical failure';}
    return outcome;
}

export function getActionCheckToolDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
    return [{
        type: 'function',
        function: {
            name: ACTION_CHECK_TOOL_NAME,
            description: [
                'True-random d20 action check for risky or uncertain RP outcomes.',
                'Use it for key actions that could truly succeed or fail and would change what happens next.',
                'Do not use it for already settled outcomes or for intimate/everyday interactions that should follow character, consent, and emotional flow.',
                'Provide the attempted action, the check or stat name, and a bare-D20 difficulty: 1-5 easy, 6-10 ordinary, 11-15 hard, 16-20 very hard, 21 nearly impossible and only beatable by natural 20.',
                'Natural 1 is critical failure with a real penalty or complication. Natural 20 is critical success with an extra reward, opening, or benefit. The result is binding truth for the current reply.',
                'For accurate card placement, call the tool before outcome narration. If visible lead-in text already exists, provide insertAfter as the exact text that should appear before the dice card.',
            ].join('\n'),
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'What the character is attempting right now.',
                    },
                    stat: {
                        type: 'string',
                        description: 'The displayed check name, attribute, skill, or trait for this roll.',
                    },
                    difficulty: {
                        type: 'number',
                        minimum: MIN_ACTION_CHECK_DIFFICULTY,
                        maximum: MAX_ACTION_CHECK_DIFFICULTY,
                        description: `Bare-D20 target number for success. Use 1-5 easy, 6-10 ordinary, 11-15 hard, 16-20 very hard, 21 nearly impossible and only beatable by natural 20. Defaults to ${DEFAULT_ACTION_CHECK_DIFFICULTY} if omitted or invalid.`,
                    },
                    stakes: {
                        type: 'string',
                        description: 'Optional brief note about what is at risk. Display-only.',
                    },
                    insertAfter: {
                        type: 'string',
                        description: 'Optional exact visible lead-in text that should appear before the dice card. Do not include consequence or outcome text.',
                    },
                },
                required: ['action', 'stat'],
                additionalProperties: false,
            },
        },
    }];
}

export function buildActionCheckProtocolMessage(): XbTavernMessage {
    return {
        role: 'system',
        content: ACTION_CHECK_PROTOCOL_PROMPT,
    };
}

export function executeTavernActionCheck(
    input: Record<string, unknown> = {},
    options: { rollDie?: () => number } = {},
): TavernActionCheckToolResult {
    const action = normalizeInlineText(input.action, 240);
    const stat = normalizeInlineText(input.stat, 120);
    if (!action || !stat) {
        return {
            ok: false,
            error: 'action_check_action_and_stat_required',
            summary: 'ActionCheck 需要同时提供 action 和 stat。',
        };
    }
    const difficulty = clampInteger(
        input.difficulty,
        MIN_ACTION_CHECK_DIFFICULTY,
        MAX_ACTION_CHECK_DIFFICULTY,
        DEFAULT_ACTION_CHECK_DIFFICULTY,
    );
    const roll = resolveD20Roll(options.rollDie);
    const outcome = resolveActionCheckOutcome(roll, difficulty);
    const success = outcome === 'success' || outcome === 'criticalSuccess';
    const stakes = normalizeInlineText(input.stakes, 240);
    const insertAfter = normalizeExactVisibleText(input.insertAfter, 240);
    return {
        ok: true,
        action,
        stat,
        difficulty,
        roll,
        success,
        outcome,
        summary: `${stat} check ${roll} vs DC ${difficulty}: ${actionCheckOutcomeLabel(outcome)}.`,
        ...(stakes ? { stakes } : {}),
        ...(insertAfter.trim() ? { insertAfter } : {}),
    };
}

export function buildDeniedActionCheckToolResult(toolName = ''): TavernActionCheckToolFailure {
    const name = normalizeInlineText(toolName, 80) || 'unknown_tool';
    return {
        ok: false,
        error: 'action_check_unknown_tool',
        summary: `主聊天当前只允许调用 ${ACTION_CHECK_TOOL_NAME}；${name} 不会执行。`,
    };
}
