import { inject, type InjectionKey } from 'vue';

// Legacy App.vue is being split into focused UI components; this bridge keeps the move mechanical until composables own narrower types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TavernAppUiContext = Record<string, any>;

export const TAVERN_APP_UI_CONTEXT: InjectionKey<TavernAppUiContext> = Symbol('TavernAppUiContext');

export function useTavernAppUiContext(): TavernAppUiContext {
    const context = inject(TAVERN_APP_UI_CONTEXT);
    if (!context) {
        throw new Error('tavern_app_ui_context_missing');
    }
    return context;
}
