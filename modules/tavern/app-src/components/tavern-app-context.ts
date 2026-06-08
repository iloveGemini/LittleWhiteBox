import { inject, type InjectionKey } from 'vue';

// Shared UI context used while page components are being split into narrower composables.
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
