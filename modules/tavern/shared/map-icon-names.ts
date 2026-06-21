export const TAVERN_LEGACY_MAP_ICON_NAMES = [
    'x',
    'o',
    '+',
    'arrow-n',
    'arrow-s',
    'arrow-e',
    'arrow-w',
    'stairs-up',
    'stairs-down',
] as const;

export const TAVERN_GAME_MAP_ICON_NAMES = [
    'castle',
    'village',
    'road',
    'house',
    'shop',
    'inn-sign',
    'temple',
    'stairs',
    'door',
    'forest',
    'mountains',
    'cave',
    'waterfall',
    'skull',
    'trap',
    'fire',
    'chest',
    'table',
    'bed',
    'barrel',
    'flag',
    'star',
    'torch',
    'portal',
    'tree',
    'rock',
    'water',
    'heart',
    'lips',
    'lovers',
    'cherish',
    'love-letter',
    'locked-heart',
    'perfume',
] as const;

export const TAVERN_MAP_ICON_NAMES = [
    ...TAVERN_LEGACY_MAP_ICON_NAMES,
    ...TAVERN_GAME_MAP_ICON_NAMES,
] as const;

export type TavernLegacyMapIconName = typeof TAVERN_LEGACY_MAP_ICON_NAMES[number];
export type TavernGameMapIconName = typeof TAVERN_GAME_MAP_ICON_NAMES[number];
export type TavernMapIconName = typeof TAVERN_MAP_ICON_NAMES[number];

const TAVERN_MAP_ICON_NAME_SET = new Set<string>(TAVERN_MAP_ICON_NAMES);

export function isTavernMapIconName(value: unknown): value is TavernMapIconName {
    return TAVERN_MAP_ICON_NAME_SET.has(String(value || '').trim());
}
