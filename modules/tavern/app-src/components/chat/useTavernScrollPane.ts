import { nextTick, ref, unref, watch, type Ref } from 'vue';
import {
    AGENT_MESSAGE_WINDOW_CHUNK,
    AGENT_MESSAGE_WINDOW_DEFAULT,
    expandMessageWindow,
    normalizeHiddenOutsideCount,
    normalizeMessageLoadBatchSize,
    resetMessageWindow,
} from '../../message-window';

export interface TavernScrollPaneOptions {
    totalItems: () => number;
    defaultLimit?: number | Ref<number>;
    loadBatchSize?: number | Ref<number>;
}

export interface TavernScrollToBottomOptions {
    collapseWindow?: boolean;
    revealHelpers?: boolean;
}

export function useTavernScrollPane(options: TavernScrollPaneOptions) {
    const scrollRef = ref<HTMLElement | null>(null);
    const autoScroll = ref(true);
    const showScrollTop = ref(false);
    const showScrollBottom = ref(false);
    const scrollControlsActive = ref(false);
    const messageWindowLimit = ref(normalizeHiddenOutsideCount(unref(options.defaultLimit), AGENT_MESSAGE_WINDOW_DEFAULT));
    let scrollHideTimer: number | null = null;
    let scrollTicking = false;
    let touchStartY: number | null = null;
    let lastScrollTop = 0;

    function resetWindowState() {
        const state = { uiMessageWindowLimit: messageWindowLimit.value };
        resetMessageWindow(state, { defaultLimit: normalizeHiddenOutsideCount(unref(options.defaultLimit), AGENT_MESSAGE_WINDOW_DEFAULT) });
        messageWindowLimit.value = Number(state.uiMessageWindowLimit || AGENT_MESSAGE_WINDOW_DEFAULT);
    }

    function revealOlderMessages(force = false) {
        const node = scrollRef.value;
        if (!force && autoScroll.value !== false) {return false;}
        if (!node || (!force && node.scrollTop > 64)) {return false;}
        const state = { uiMessageWindowLimit: messageWindowLimit.value };
        if (!expandMessageWindow(state, options.totalItems(), {
            defaultLimit: normalizeHiddenOutsideCount(unref(options.defaultLimit), AGENT_MESSAGE_WINDOW_DEFAULT),
            chunk: normalizeMessageLoadBatchSize(unref(options.loadBatchSize), AGENT_MESSAGE_WINDOW_CHUNK),
        })) {return false;}
        messageWindowLimit.value = Number(state.uiMessageWindowLimit || messageWindowLimit.value);
        autoScroll.value = false;
        return true;
    }

    function updateScrollButtons() {
        const node = scrollRef.value;
        if (!node) {
            showScrollTop.value = false;
            showScrollBottom.value = false;
            return;
        }
        const threshold = 80;
        showScrollTop.value = node.scrollTop > threshold;
        showScrollBottom.value = node.scrollHeight - node.scrollTop - node.clientHeight > threshold;
    }

    function scheduleHideScrollHelpers() {
        scrollControlsActive.value = true;
        scrollRef.value?.classList.add('is-scrolling');
        if (scrollHideTimer) {
            window.clearTimeout(scrollHideTimer);
        }
        scrollHideTimer = window.setTimeout(() => {
            scrollControlsActive.value = false;
            scrollRef.value?.classList.remove('is-scrolling');
            scrollHideTimer = null;
        }, 1500);
    }

    function isNearBottom(threshold = 56) {
        const node = scrollRef.value;
        if (!node) {return true;}
        return node.scrollHeight - node.scrollTop - node.clientHeight <= threshold;
    }

    function collapseMessageWindowIfBottom(force = false) {
        const defaultLimit = normalizeHiddenOutsideCount(unref(options.defaultLimit), AGENT_MESSAGE_WINDOW_DEFAULT);
        if (messageWindowLimit.value <= defaultLimit) {return false;}
        if (!force && !isNearBottom(8)) {return false;}
        resetWindowState();
        return true;
    }

    watch(() => normalizeHiddenOutsideCount(unref(options.defaultLimit), AGENT_MESSAGE_WINDOW_DEFAULT), () => {
        resetWindowState();
    });

    function scrollToBottom(force = false, scrollOptions: TavernScrollToBottomOptions = {}) {
        if (!force && !autoScroll.value) {return;}
        if (force) {autoScroll.value = true;}
        if (scrollOptions.collapseWindow || autoScroll.value) {
            collapseMessageWindowIfBottom(true);
        }
        void nextTick(() => {
            const node = scrollRef.value;
            if (!node) {return;}
            const apply = () => {
                node.scrollTop = node.scrollHeight;
            };
            apply();
            requestAnimationFrame(() => {
                apply();
                requestAnimationFrame(() => {
                    apply();
                    updateScrollButtons();
                    if (scrollOptions.revealHelpers) {
                        scheduleHideScrollHelpers();
                    }
                });
            });
        });
    }

    function scrollToTop() {
        const node = scrollRef.value;
        if (!node) {return;}
        autoScroll.value = false;
        lastScrollTop = 0;
        node.scrollTo?.({ top: 0, behavior: 'smooth' });
        node.scrollTop = 0;
        updateScrollButtons();
        scheduleHideScrollHelpers();
    }

    function handleScroll() {
        const node = scrollRef.value;
        if (!node) {return;}
        if (revealOlderMessages()) {return;}
        const currentScrollTop = Number(node.scrollTop || 0);
        const scrollingTowardBottom = currentScrollTop > lastScrollTop;
        lastScrollTop = currentScrollTop;
        const nearBottom = isNearBottom();
        if (nearBottom) {
            if (autoScroll.value !== false || scrollingTowardBottom) {
                autoScroll.value = true;
                collapseMessageWindowIfBottom();
            }
        } else {
            autoScroll.value = false;
        }
        if (scrollTicking) {return;}
        scrollTicking = true;
        requestAnimationFrame(() => {
            updateScrollButtons();
            scheduleHideScrollHelpers();
            scrollTicking = false;
        });
    }

    function handleWheel(event: WheelEvent) {
        if (Number(event.deltaY || 0) < 0) {
            autoScroll.value = false;
        }
    }

    function handleTouchStart(event: TouchEvent) {
        touchStartY = Number(event.touches?.[0]?.clientY);
    }

    function handleTouchMove(event: TouchEvent) {
        const currentY = Number(event.touches?.[0]?.clientY);
        if (!Number.isFinite(Number(touchStartY)) || !Number.isFinite(currentY)) {
            autoScroll.value = false;
            return;
        }
        if (touchStartY !== null && (currentY > touchStartY + 4 || !isNearBottom())) {
            autoScroll.value = false;
        }
    }

    function resetPositionState() {
        lastScrollTop = 0;
    }

    function cleanup() {
        if (scrollHideTimer) {
            window.clearTimeout(scrollHideTimer);
            scrollHideTimer = null;
        }
        scrollRef.value?.classList.remove('is-scrolling');
    }

    return {
        scrollRef: scrollRef as Ref<HTMLElement | null>,
        autoScroll,
        showScrollTop,
        showScrollBottom,
        scrollControlsActive,
        messageWindowLimit,
        resetWindowState,
        revealOlderMessages,
        updateScrollButtons,
        isNearBottom,
        collapseMessageWindowIfBottom,
        scrollToBottom,
        scrollToTop,
        handleScroll,
        handleWheel,
        handleTouchStart,
        handleTouchMove,
        resetPositionState,
        cleanup,
    };
}
