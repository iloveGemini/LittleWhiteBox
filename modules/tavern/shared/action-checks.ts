import type { XbTavernMessage } from './message-assembler';
import type { TavernStatusDocument, TavernStatusGaugeField } from './status-state';

export const ACTION_CHECK_TOOL_NAME = 'ActionCheck';
export const DEFAULT_ACTION_CHECK_DIFFICULTY = 10;
export const MIN_ACTION_CHECK_DIFFICULTY = 1;
export const MAX_ACTION_CHECK_DIFFICULTY = 21;
export const ACTION_CHECK_DIE_SIDES = 20;
export const ACTION_CHECK_PERCENT_DIE_SIDES = 100;
export type TavernActionCheckDifficultyLabel = 'easy' | 'ordinary' | 'hard' | 'very_hard' | 'nearly_impossible';
export type TavernActionCheckMode = 'statusGauge' | 'd20Fallback';
export type TavernActionCheckOutcome = 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure';

export interface TavernActionCheckInput {
    action: string;
    stat: string;
    difficulty?: number | TavernActionCheckDifficultyLabel;
    stakes?: string;
    insertAfter?: string;
}

export interface TavernActionCheckToolSuccess {
    ok: true;
    action: string;
    stat: string;
    difficulty: number;
    difficultyLabel: TavernActionCheckDifficultyLabel;
    mode: TavernActionCheckMode;
    roll: number;
    success: boolean;
    outcome: TavernActionCheckOutcome;
    summary: string;
    threshold?: number;
    statValue?: number;
    statMax?: number;
    stakes?: string;
    insertAfter?: string;
}

export interface TavernActionCheckToolFailure {
    ok: false;
    error: string;
    summary: string;
}

export type TavernActionCheckToolResult = TavernActionCheckToolSuccess | TavernActionCheckToolFailure;

const ACTION_CHECK_DIFFICULTY_LABELS: TavernActionCheckDifficultyLabel[] = [
    'easy',
    'ordinary',
    'hard',
    'very_hard',
    'nearly_impossible',
];

const ACTION_CHECK_FALLBACK_DC: Record<TavernActionCheckDifficultyLabel, number> = {
    easy: 5,
    ordinary: 10,
    hard: 15,
    very_hard: 20,
    nearly_impossible: 21,
};

const ACTION_CHECK_STATUS_OFFSETS: Record<TavernActionCheckDifficultyLabel, number> = {
    easy: 20,
    ordinary: 0,
    hard: -20,
    very_hard: -40,
    nearly_impossible: -60,
};

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
    'Choose the stat that best fits the action from the status panel (e.g. Strength, Perception, Willpower) and pass the attribute name as `stat`. If the status panel has no matching attribute, the system falls back to a flat roll automatically.',
    '',
    'Choose the objective difficulty of the task itself: how hard it would be for an average person, regardless of how strong this character is. Do not inflate difficulty because the character has high stats; the system factors in their actual attribute value automatically. Difficulty levels: `easy`, `ordinary`, `hard`, `very_hard`, `nearly_impossible`. Pick based on danger, pressure, preparation, opposition, and fictional leverage.',
    '',
    'The tool may return Critical Success or Critical Failure. Critical Failure means things get dramatically worse: add a real complication, cost, loss of position, exposure, harm, or worsening situation. Critical Success means an overpowering triumph: grant an extra benefit, surprise reward, opening, momentum, information, style, or reduced cost. The tool enforces these results; honor them strictly in narration.',
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

function normalizeActionCheckDifficultyLabel(value: unknown): TavernActionCheckDifficultyLabel {
    const text = normalizeInlineText(value, 40);
    if ((ACTION_CHECK_DIFFICULTY_LABELS as string[]).includes(text)) {
        return text as TavernActionCheckDifficultyLabel;
    }
    const numeric = clampInteger(value, MIN_ACTION_CHECK_DIFFICULTY, MAX_ACTION_CHECK_DIFFICULTY, DEFAULT_ACTION_CHECK_DIFFICULTY);
    if (numeric <= 5) {return 'easy';}
    if (numeric <= 10) {return 'ordinary';}
    if (numeric <= 15) {return 'hard';}
    if (numeric <= 20) {return 'very_hard';}
    return 'nearly_impossible';
}

function resolveD20Roll(roller?: () => number): number {
    if (typeof roller === 'function') {
        return clampInteger(roller(), 1, ACTION_CHECK_DIE_SIDES, 1);
    }
    return Math.floor(Math.random() * ACTION_CHECK_DIE_SIDES) + 1;
}

function resolvePercentRoll(roller?: () => number): number {
    if (typeof roller === 'function') {
        return clampInteger(roller(), 1, ACTION_CHECK_PERCENT_DIE_SIDES, 1);
    }
    return Math.floor(Math.random() * ACTION_CHECK_PERCENT_DIE_SIDES) + 1;
}

function resolveActionCheckOutcome(roll: number, difficulty: number): TavernActionCheckOutcome {
    if (roll <= 1) {return 'criticalFailure';}
    if (roll >= ACTION_CHECK_DIE_SIDES) {return 'criticalSuccess';}
    return roll >= difficulty ? 'success' : 'failure';
}

function resolveStatusGaugeOutcome(roll: number, threshold: number): TavernActionCheckOutcome {
    if (roll <= 5) {return 'criticalSuccess';}
    if (roll >= 96) {return 'criticalFailure';}
    return roll <= threshold ? 'success' : 'failure';
}

function actionCheckOutcomeLabel(outcome: TavernActionCheckOutcome): string {
    if (outcome === 'criticalSuccess') {return 'critical success';}
    if (outcome === 'criticalFailure') {return 'critical failure';}
    return outcome;
}

function findGaugeFieldInSubject(subject: TavernStatusDocument['subjects'][number], name: string): TavernStatusGaugeField | null {
    for (const tab of Array.isArray(subject.tabs) ? subject.tabs : []) {
        for (const block of Array.isArray(tab.blocks) ? tab.blocks : []) {
            if (block.form !== 'gauge') {continue;}
            for (const field of Array.isArray(block.fields) ? block.fields : []) {
                const gauge = field as TavernStatusGaugeField;
                if (normalizeInlineText(gauge.name, 120) === name) {
                    return gauge;
                }
            }
        }
    }
    return null;
}

function findStatusGaugeByStat(document: TavernStatusDocument | null | undefined, stat = ''): TavernStatusGaugeField | null {
    const name = normalizeInlineText(stat, 120);
    if (!name || !Array.isArray(document?.subjects)) {return null;}
    const activeSubjectId = normalizeInlineText(document.meta?.activeSubject, 120);
    const activeSubject = activeSubjectId
        ? document.subjects.find((subject) => normalizeInlineText(subject.id, 120) === activeSubjectId) || null
        : null;
    if (activeSubject) {
        return findGaugeFieldInSubject(activeSubject, name);
    }
    for (const subject of document.subjects) {
        const gauge = findGaugeFieldInSubject(subject, name);
        if (gauge) {return gauge;}
    }
    return null;
}

function resolveStatusGaugeBasis(field: TavernStatusGaugeField): number | null {
    const statValue = Number(field.value);
    const statMax = Number(field.max);
    const statMin = Number.isFinite(Number(field.min)) ? Number(field.min) : 0;
    if (!Number.isFinite(statValue) || !Number.isFinite(statMax) || statMax <= 0) {return null;}
    const span = Math.max(1, statMax - statMin);
    return clampInteger(((statValue - statMin) / span) * 100, 0, 100, 0);
}

export function getActionCheckToolDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
    return [{
        type: 'function',
        function: {
            name: ACTION_CHECK_TOOL_NAME,
            description: [
                'True-random action check for risky or uncertain RP outcomes.',
                'Use it for key actions that could truly succeed or fail and would change what happens next.',
                'Do not use it for already settled outcomes or for intimate/everyday interactions that should follow character, consent, and emotional flow.',
                'Provide the attempted action, the status-panel attribute name that best fits it, and the objective difficulty level: easy, ordinary, hard, very_hard, or nearly_impossible.',
                'If no matching status-panel attribute exists, the system falls back to a flat check automatically. Critical failure adds a real penalty or complication; critical success grants an extra reward, opening, or benefit. The result is binding truth for the current reply.',
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
                        description: 'Name of the attribute from the status panel that best fits this action.',
                    },
                    difficulty: {
                        type: 'string',
                        enum: ACTION_CHECK_DIFFICULTY_LABELS,
                        description: 'Objective task difficulty for an average person, before applying the character attribute. Defaults to ordinary if omitted or invalid.',
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
    options: { rollDie?: () => number; rollPercent?: () => number; statusDocument?: TavernStatusDocument | null } = {},
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
    const difficultyLabel = normalizeActionCheckDifficultyLabel(input.difficulty);
    const difficulty = ACTION_CHECK_FALLBACK_DC[difficultyLabel];
    const gauge = findStatusGaugeByStat(options.statusDocument, stat);
    const stakes = normalizeInlineText(input.stakes, 240);
    const insertAfter = normalizeExactVisibleText(input.insertAfter, 240);
    if (gauge) {
        const statValue = Number(gauge.value);
        const statMax = Number(gauge.max);
        const basis = resolveStatusGaugeBasis(gauge);
        if (basis !== null && Number.isFinite(statValue) && Number.isFinite(statMax)) {
            const threshold = clampInteger(basis + ACTION_CHECK_STATUS_OFFSETS[difficultyLabel], 1, 99, 50);
            const percentRoll = resolvePercentRoll(options.rollPercent || options.rollDie);
            const outcome = resolveStatusGaugeOutcome(percentRoll, threshold);
            const success = outcome === 'success' || outcome === 'criticalSuccess';
            return {
                ok: true,
                action,
                stat,
                difficulty,
                difficultyLabel,
                mode: 'statusGauge',
                roll: percentRoll,
                threshold,
                statValue,
                statMax,
                success,
                outcome,
                summary: `${stat} check ${percentRoll} vs ${threshold}% (${statValue}/${statMax}, ${difficultyLabel}): ${actionCheckOutcomeLabel(outcome)}.`,
                ...(stakes ? { stakes } : {}),
                ...(insertAfter.trim() ? { insertAfter } : {}),
            };
        }
    }
    const roll = resolveD20Roll(options.rollDie);
    const outcome = resolveActionCheckOutcome(roll, difficulty);
    const success = outcome === 'success' || outcome === 'criticalSuccess';
    return {
        ok: true,
        action,
        stat,
        difficulty,
        difficultyLabel,
        mode: 'd20Fallback',
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
