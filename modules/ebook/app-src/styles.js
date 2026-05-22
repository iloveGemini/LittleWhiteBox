export function injectEbookStyles(rootId = 'xb-ebook-root') {
    if (document.getElementById('xb-ebook-styles')) return;
    const style = document.createElement('style');
    style.id = 'xb-ebook-styles';
    style.textContent = `
        :root {
            color-scheme: light;
            font-family: "LXGW WenKai", "ZCOOL XiaoWei", "Noto Serif SC", "Microsoft YaHei", serif;
            --paper: #fff9ed;
            --ink: #222018;
            --muted: #766f62;
            --line: rgba(64, 52, 36, 0.14);
            --accent: #ad5a2b;
            --accent-dark: #6f351b;
            --green: #59744a;
            --shadow: 0 18px 60px rgba(72, 48, 24, 0.18);
        }
        html, body, #${rootId} { width: 100%; height: 100%; margin: 0; overflow: hidden; }
        body {
            background:
                radial-gradient(circle at 12% 8%, rgba(255, 225, 170, 0.72), transparent 32%),
                radial-gradient(circle at 88% 12%, rgba(172, 190, 154, 0.52), transparent 28%),
                linear-gradient(135deg, #f1dec0, #d8c2a3 46%, #b9946b);
            color: var(--ink);
        }
        button {
            font: inherit;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.56);
            color: var(--ink);
            cursor: pointer;
            transition: transform .14s ease, background .14s ease, box-shadow .14s ease;
        }
        button:hover:not(:disabled) { transform: translateY(-1px); background: rgba(255, 255, 255, 0.82); box-shadow: 0 8px 24px rgba(80, 48, 24, .10); }
        button:disabled { opacity: .5; cursor: not-allowed; }
        input, select, textarea {
            font: inherit;
        }
        .xb-ebook-screen { height: 100%; min-height: 0; overflow: hidden; background: rgba(255, 249, 237, .78); }
        .xb-topbar {
            height: 88px;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            padding: 20px 28px;
            border-bottom: 1px solid var(--line);
            background: rgba(255, 249, 237, .70);
            backdrop-filter: blur(18px);
        }
        .xb-topbar p { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
        .xb-library-main, .xb-entry-main {
            height: calc(100% - 88px);
            box-sizing: border-box;
            overflow: auto;
            padding: 28px;
            display: grid;
            align-content: start;
            gap: 20px;
        }
        .xb-library-hero, .xb-entry-hero {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            padding: 34px;
            border-radius: 28px;
            background:
                radial-gradient(circle at 90% 16%, rgba(173, 90, 43, .14), transparent 34%),
                linear-gradient(135deg, rgba(255, 255, 255, .72), rgba(255, 242, 216, .56));
            border: 1px solid rgba(64, 52, 36, .12);
            box-shadow: var(--shadow);
        }
        .xb-library-hero h2, .xb-entry-copy h2 { margin: 0; font-size: 38px; }
        .xb-library-hero p, .xb-entry-copy p { max-width: 720px; margin: 10px 0 0; color: var(--muted); font-size: 15px; line-height: 1.8; }
        .xb-library-empty { padding: 28px; border-radius: 22px; background: rgba(255,255,255,.48); }
        .xb-ebook-shell { height: 100%; display: grid; grid-template-columns: 260px minmax(0, 1fr); overflow: hidden; background: rgba(255, 249, 237, .78); }
        .xb-studio-workbench { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr); overflow: hidden; }
        .xb-sidebar, .xb-agent { min-width: 0; padding: 20px; overflow: hidden; backdrop-filter: blur(18px); }
        .xb-sidebar { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 12px; border-right: 1px solid var(--line); background: rgba(83, 57, 36, .08); }
        .xb-agent { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; border-left: 1px solid var(--line); background: rgba(255, 244, 222, .72); }
        .xb-brand, .xb-panel-head, .xb-editor-head, .xb-agent-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .xb-brand { min-width: 0; }
        .xb-brand .xb-title-row { width: 100%; }
        .xb-title-row { min-width: 0; display: flex; align-items: center; gap: 8px; }
        .xb-title-row h1, .xb-title-row h2 { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .xb-kicker { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--accent-dark); }
        h1, h2 { margin: 0; line-height: 1.1; }
        h1 { font-size: 26px; }
        h2 { font-size: 20px; }
        #xb-close { min-width: 48px; height: 32px; border-radius: 999px; padding: 0 10px; font-size: 13px; font-weight: 800; line-height: 1; }
        .xb-icon-button { width: 34px; height: 34px; padding: 0; display: inline-grid; place-items: center; font-size: 18px; line-height: 1; border-radius: 12px; font-weight: 900; }
        .xb-panel { min-height: 0; display: grid; gap: 7px; }
        .xb-files-panel { overflow: hidden; }
        .xb-panel-head { font-weight: 700; color: var(--accent-dark); }
        .xb-panel-head button { padding: 5px 9px; font-size: 12px; }
        .xb-panel-note { color: var(--muted); font-size: 12px; line-height: 1.45; padding: 2px 2px 4px; }
        .xb-books, .xb-files, .xb-imports { display: grid; gap: 7px; min-height: 0; }
        .xb-files { overflow: auto; align-content: start; padding-right: 2px; }
        .xb-book, .xb-file, .xb-imports button, .xb-actions button { padding: 9px 10px; text-align: left; }
        .xb-book.is-active, .xb-file.is-active { background: rgba(173, 90, 43, .16); border-color: rgba(173, 90, 43, .38); color: var(--accent-dark); font-weight: 700; }
        .xb-file-group { display: grid; gap: 5px; padding: 9px; border-radius: 14px; background: rgba(255,255,255,.30); border: 1px solid rgba(64, 52, 36, .08); }
        .xb-file-group-title { margin: 3px 2px 0; color: var(--accent-dark); font-size: 12px; font-weight: 900; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .xb-file-group-title em { color: var(--green); background: rgba(89, 116, 74, .12); border-radius: 999px; padding: 2px 7px; font-size: 10px; font-style: normal; font-weight: 800; }
        .xb-file-group-desc { color: var(--muted); font-size: 11px; line-height: 1.35; margin: -3px 2px 0; }
        .xb-section-subtitle { margin: 3px 2px -1px; color: var(--muted); font-size: 11px; font-weight: 800; }
        .xb-section-empty { color: var(--muted); font-size: 12px; line-height: 1.45; padding: 8px 10px; border: 1px dashed rgba(64, 52, 36, .14); border-radius: 12px; background: rgba(255,255,255,.24); }
        .xb-imports { grid-template-columns: 1fr 1fr; }
        .xb-imports button { font-size: 12px; text-align: center; color: var(--accent-dark); font-weight: 800; }
        .xb-ebook-settings-overlay {
            position: absolute;
            inset: 0;
            z-index: 30;
            display: grid;
            place-items: center;
            padding: 28px;
            background: rgba(34, 24, 12, 0.34);
            backdrop-filter: blur(8px);
        }
        .xb-ebook-settings-dialog {
            width: min(760px, 100%);
            max-height: min(88vh, 920px);
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            border-radius: 28px;
            overflow: hidden;
            border: 1px solid rgba(64, 52, 36, .14);
            background:
                radial-gradient(circle at 100% 0%, rgba(173, 90, 43, .10), transparent 32%),
                linear-gradient(180deg, rgba(255,255,255,.94), rgba(255, 248, 236, .92));
            box-shadow: 0 24px 70px rgba(40, 24, 8, .24);
        }
        .xb-ebook-settings-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
            padding: 24px 26px 18px;
            border-bottom: 1px solid rgba(64, 52, 36, .10);
        }
        .xb-ebook-settings-head p {
            margin: 8px 0 0;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.6;
        }
        .xb-ebook-settings-head button {
            min-width: 58px;
            padding: 8px 14px;
            font-size: 13px;
            font-weight: 800;
        }
        .xb-ebook-settings-body {
            min-height: 0;
            overflow: auto;
            padding: 22px 26px 26px;
        }
        .xb-ebook-settings-body .xb-assistant-config {
            display: grid;
            gap: 12px;
        }
        .xb-ebook-settings-body .xb-assistant-config-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            padding: 4px;
            border-radius: 14px;
            background: rgba(64, 52, 36, .08);
        }
        .xb-ebook-settings-body .xb-assistant-config-tab {
            min-height: 34px;
            border: 0;
            border-radius: 10px;
            background: transparent;
            color: var(--muted);
            font-weight: 800;
            cursor: pointer;
        }
        .xb-ebook-settings-body .xb-assistant-config-tab.is-active {
            background: rgba(255, 255, 255, .9);
            color: var(--accent-dark);
            box-shadow: 0 6px 18px rgba(64, 52, 36, .08);
        }
        .xb-ebook-settings-body .xb-assistant-config-page {
            display: grid;
            gap: 12px;
        }
        .xb-ebook-settings-body .xb-assistant-config-page[hidden] {
            display: none;
        }
        .xb-ebook-settings-body .xb-assistant-config-note {
            margin: 0;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.55;
        }
        .xb-ebook-settings-body .xb-assistant-inline-status {
            min-height: 18px;
            margin-top: -6px;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.5;
        }
        .xb-ebook-settings-body .xb-assistant-inline-status.is-success {
            color: rgba(89, 116, 74, .95);
        }
        .xb-ebook-settings-body .xb-assistant-inline-status.is-error {
            color: rgba(136, 61, 40, .95);
        }
        .xb-ebook-settings-body .xb-assistant-inline-status.is-loading {
            color: var(--accent-dark);
        }
        .xb-ebook-settings-body .xb-assistant-config label {
            display: grid;
            gap: 6px;
            font-size: 13px;
            color: var(--accent-dark);
        }
        .xb-ebook-settings-body .xb-assistant-config input,
        .xb-ebook-settings-body .xb-assistant-config select {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid rgba(64, 52, 36, .14);
            border-radius: 14px;
            padding: 12px 14px;
            background: rgba(255, 255, 255, .82);
            color: var(--ink);
        }
        .xb-ebook-settings-body .xb-assistant-inline-input {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
        }
        .xb-ebook-settings-body .xb-assistant-grow {
            min-width: 0;
        }
        .xb-ebook-settings-body .xb-assistant-model-row {
            align-items: end;
        }
        .xb-ebook-settings-body .xb-assistant-checkbox-row {
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
        }
        .xb-ebook-settings-body .xb-assistant-checkbox-control {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--accent-dark);
        }
        .xb-ebook-settings-body .xb-assistant-checkbox-control input {
            width: 16px;
            height: 16px;
            accent-color: var(--accent);
        }
        .xb-ebook-settings-body .xb-assistant-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .xb-ebook-settings-body .xb-assistant-actions button {
            min-height: 40px;
            padding: 0 16px;
            border-radius: 999px;
            font-weight: 800;
        }
        .xb-ebook-settings-body .xb-assistant-runtime {
            color: var(--muted);
            font-size: 12px;
            line-height: 1.55;
        }
        .xb-assistant-save-button.is-saving,
        .xb-assistant-save-button.is-success,
        .xb-assistant-save-button.is-error {
            pointer-events: none;
        }
        .xb-assistant-save-button.is-success {
            background: rgba(89, 116, 74, .92);
            color: #fffdf7;
            border-color: rgba(89, 116, 74, .92);
        }
        .xb-assistant-save-button.is-error {
            background: rgba(136, 61, 40, .92);
            color: #fffdf7;
            border-color: rgba(136, 61, 40, .92);
        }
        .xb-assistant-save-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            margin-right: 6px;
            border: 2px solid rgba(255,255,255,.4);
            border-top-color: currentColor;
            border-radius: 50%;
            vertical-align: -2px;
            animation: xb-ebook-spin .8s linear infinite;
        }
        @keyframes xb-ebook-spin {
            to { transform: rotate(360deg); }
        }
        .xb-file { display: grid; gap: 2px; font-size: 13px; }
        .xb-file-main { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .xb-file small { color: var(--muted); font-size: 10px; font-family: "Cascadia Code", "Consolas", monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .xb-editor { min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--paper); }
        .xb-editor-head { padding: 18px 22px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, rgba(255,255,255,.52), rgba(255,255,255,.16)); }
        .xb-path { font-weight: 800; color: var(--accent-dark); }
        .xb-meta, .xb-agent-head p, .xb-tool small, .xb-empty, .xb-agent-empty, .xb-agent-note { color: var(--muted); font-size: 12px; }
        .xb-editor-actions { display: flex; gap: 8px; }
        .xb-editor-actions button { padding: 8px 12px; }
        .xb-editor-body { min-height: 0; padding: 22px; overflow: hidden; display: grid; grid-template-rows: minmax(0, 1fr); gap: 14px; }
        .xb-home {
            min-height: 0;
            overflow: auto;
            display: grid;
            align-content: start;
            gap: 14px;
        }
        .xb-home-hero {
            display: grid;
            gap: 14px;
            padding: 30px;
            border-radius: 24px;
            background:
                radial-gradient(circle at 88% 18%, rgba(173, 90, 43, .13), transparent 32%),
                linear-gradient(135deg, rgba(255, 255, 255, .72), rgba(255, 242, 216, .56));
            border: 1px solid rgba(64, 52, 36, .12);
            box-shadow: var(--shadow);
        }
        .xb-home-hero h2 { font-size: 34px; }
        .xb-home-hero p {
            max-width: 760px;
            margin: 0;
            color: var(--muted);
            font-size: 15px;
            line-height: 1.8;
        }
        .xb-home-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .xb-home-actions button {
            padding: 10px 14px;
            color: var(--accent-dark);
            font-weight: 800;
        }
        .xb-library-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
            gap: 10px;
        }
        .xb-library-book {
            position: relative;
            display: grid;
            gap: 7px;
            min-height: 136px;
            padding: 18px 18px 16px 24px;
            text-align: left;
            align-content: start;
            border-radius: 20px;
            background:
                linear-gradient(90deg, rgba(111, 53, 27, .26) 0 7px, transparent 7px 100%),
                rgba(255, 255, 255, .54);
        }
        .xb-library-book strong {
            color: var(--accent-dark);
            font-size: 20px;
        }
        .xb-library-book small {
            color: var(--muted);
            font-size: 12px;
        }
        .xb-library-book em {
            align-self: end;
            color: var(--green);
            font-size: 12px;
            font-style: normal;
            font-weight: 900;
        }
        .xb-book-spine {
            position: absolute;
            left: 8px;
            top: 14px;
            bottom: 14px;
            width: 4px;
            border-radius: 999px;
            background: rgba(173, 90, 43, .42);
        }
        .xb-library-book.is-active {
            background: rgba(173, 90, 43, .14);
            border-color: rgba(173, 90, 43, .34);
        }
        .xb-back-link {
            justify-self: start;
            padding: 8px 12px;
            color: var(--accent-dark);
            font-weight: 800;
        }
        .xb-entry-hero { justify-content: flex-start; }
        .xb-book-cover {
            width: 150px;
            height: 206px;
            flex: 0 0 auto;
            display: grid;
            place-items: center;
            border-radius: 12px 22px 22px 12px;
            background:
                linear-gradient(90deg, rgba(111, 53, 27, .34) 0 16px, transparent 16px 100%),
                linear-gradient(135deg, #c8763c, #7e3f22);
            box-shadow: 0 22px 60px rgba(80, 48, 24, .22);
            color: #fff8ed;
            font-size: 58px;
            font-weight: 900;
        }
        .xb-entry-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(220px, 1fr));
            gap: 16px;
        }
        .xb-entry-action {
            min-height: 170px;
            display: grid;
            align-content: center;
            gap: 10px;
            padding: 26px;
            text-align: left;
            border-radius: 24px;
            background: rgba(255, 255, 255, .58);
        }
        .xb-entry-action strong {
            color: var(--accent-dark);
            font-size: 30px;
        }
        .xb-entry-action span {
            color: var(--muted);
            font-size: 14px;
            line-height: 1.7;
        }
        .xb-entry-action.is-reader { background: rgba(255, 252, 244, .72); }
        .xb-guide-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }
        .xb-guide-card, .xb-api-card {
            display: grid;
            gap: 5px;
            padding: 14px 16px;
            border-radius: 16px;
            background: rgba(255, 255, 255, .52);
            border: 1px solid rgba(64, 52, 36, .10);
            color: var(--muted);
            font-size: 12px;
            line-height: 1.55;
        }
        .xb-guide-card strong, .xb-api-card strong {
            color: var(--accent-dark);
            font-size: 13px;
        }
        .xb-guide-card code {
            padding: 0.08em 0.32em;
            border-radius: 7px;
            background: rgba(173, 90, 43, .10);
            color: var(--accent-dark);
            font-family: "Cascadia Code", "Consolas", monospace;
        }
        .xb-api-card.is-warn { border-color: rgba(173, 90, 43, .30); background: rgba(255, 243, 222, .72); }
        .xb-api-card.is-error { border-color: rgba(160, 40, 40, .28); background: rgba(255, 235, 230, .72); }
        #xb-editor-text {
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            resize: none;
            border: none;
            outline: none;
            border-radius: 22px;
            padding: 28px;
            background:
                linear-gradient(90deg, rgba(173, 90, 43, .05) 0 1px, transparent 1px 100%),
                linear-gradient(#fffdf7, #fffaf0);
            background-size: 28px 100%, auto;
            box-shadow: inset 0 0 0 1px rgba(78, 55, 31, .10), var(--shadow);
            color: var(--ink);
            font: 16px/1.85 "LXGW WenKai", "ZCOOL XiaoWei", "Noto Serif SC", serif;
        }
        .xb-reader-main {
            height: calc(100% - 88px);
            min-height: 0;
            display: grid;
            grid-template-columns: 250px minmax(360px, 820px);
            justify-content: center;
            gap: 24px;
            padding: 24px;
            box-sizing: border-box;
            overflow: hidden;
        }
        .xb-reader-nav {
            min-height: 0;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            gap: 10px;
            padding: 16px;
            border-radius: 22px;
            background: rgba(255, 249, 237, .72);
            border: 1px solid var(--line);
            backdrop-filter: blur(16px);
        }
        .xb-reader-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .xb-reader-actions .xb-back-link { justify-self: stretch; text-align: center; }
        .xb-reader-chapters {
            min-height: 0;
            overflow: auto;
            display: grid;
            align-content: start;
            gap: 7px;
        }
        .xb-reader-chapter {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            text-align: left;
        }
        .xb-reader-chapter.is-active {
            background: rgba(173, 90, 43, .16);
            border-color: rgba(173, 90, 43, .38);
            color: var(--accent-dark);
            font-weight: 900;
        }
        .xb-reader-chapter small { color: var(--muted); }
        .xb-reader-paper {
            min-height: 0;
            overflow: auto;
            padding: 42px 54px;
            border-radius: 26px;
            background: linear-gradient(#fffdf7, #fffaf0);
            box-shadow: var(--shadow);
            border: 1px solid rgba(78, 55, 31, .10);
        }
        .xb-reader-head {
            margin-bottom: 28px;
            padding-bottom: 18px;
            border-bottom: 1px solid var(--line);
        }
        .xb-reader-head h2 { font-size: 32px; }
        .xb-reader-head p { color: var(--muted); font-size: 12px; }
        .xb-reader-content {
            white-space: pre-wrap;
            color: var(--ink);
            font: 18px/2.05 "LXGW WenKai", "ZCOOL XiaoWei", "Noto Serif SC", serif;
        }
        .xb-reader-foot {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-top: 34px;
            padding-top: 20px;
            border-top: 1px solid var(--line);
        }
        .xb-reader-foot button, .xb-reader-empty button { padding: 10px 16px; color: var(--accent-dark); font-weight: 900; }
        .xb-reader-empty {
            min-height: 100%;
            display: grid;
            place-content: center;
            justify-items: center;
            gap: 10px;
            color: var(--muted);
            text-align: center;
        }
        .xb-reader-empty h2 { color: var(--accent-dark); font-size: 34px; }
        .xb-agent-head {
            align-items: center;
            justify-content: flex-start;
        }
        .xb-agent-toolbar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            width: 100%;
        }
        .xb-agent-head .xb-agent-context-meter {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 86px;
            max-width: 100%;
            margin: 0;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(89, 116, 74, .10);
            color: var(--green);
            font-size: 12px;
            font-weight: 800;
        }
        .xb-agent-toolbar button {
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 800;
            color: var(--accent-dark);
            background: rgba(255, 255, 255, .44);
        }
        #xb-agent-close {
            margin-left: auto;
        }
        .xb-status { white-space: nowrap; border-radius: 999px; padding: 6px 10px; background: rgba(89, 116, 74, .13); color: var(--green); font-size: 12px; }
        .xb-status.is-busy { background: rgba(173, 90, 43, .14); color: var(--accent-dark); }
        .xb-status.is-busy::before {
            content: '';
            display: inline-block;
            width: 8px;
            height: 8px;
            margin-right: 7px;
            border-radius: 999px;
            background: var(--accent);
            animation: xb-ebook-pulse 1.2s ease infinite;
            vertical-align: middle;
        }
        .xb-agent-note {
            padding: 10px 12px;
            border-radius: 14px;
            background: rgba(255, 255, 255, .42);
            border: 1px solid rgba(64, 52, 36, .10);
            line-height: 1.55;
        }
        .xb-agent-note.is-warn { border-color: rgba(173, 90, 43, .28); background: rgba(255, 243, 222, .62); }
        .xb-agent-note.is-error { border-color: rgba(160, 40, 40, .24); background: rgba(255, 235, 230, .62); }
        .xb-actions-panel {
            border: 1px solid rgba(64, 52, 36, .10);
            border-radius: 14px;
            padding: 8px 10px;
            background: rgba(255, 255, 255, .34);
            color: var(--muted);
            font-size: 12px;
        }
        .xb-actions-panel summary {
            cursor: pointer;
            color: var(--accent-dark);
            font-weight: 800;
        }
        .xb-actions-panel[open] { display: grid; gap: 8px; }
        .xb-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .xb-actions button { text-align: center; color: var(--accent-dark); font-weight: 700; }
        .xb-agent-main { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 4px; }
        .xb-agent-log { min-height: 0; display: flex; flex-direction: column; gap: 10px; }
        .xb-agent-memory { color: var(--muted); font-size: 12px; border-bottom: 1px solid var(--line); padding: 0 0 8px; }
        .xb-msg { border: 1px solid var(--line); border-radius: 16px; padding: 10px 12px; background: rgba(255,255,255,.48); }
        .xb-msg-user { background: rgba(173, 90, 43, .10); }
        .xb-msg.is-error { border-color: rgba(180, 40, 40, .35); color: #842121; }
        .xb-msg.is-streaming { border-color: rgba(173, 90, 43, .28); background: rgba(255, 243, 222, .50); }
        .xb-msg-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 5px; }
        .xb-msg-role { font-weight: 800; font-size: 12px; color: var(--accent-dark); }
        .xb-msg-actions { display: inline-flex; align-items: center; gap: 5px; }
        .xb-msg-action {
            width: 24px;
            height: 24px;
            min-width: 24px;
            padding: 0;
            border-radius: 999px;
            background: rgba(255, 255, 255, .58);
            color: var(--muted);
            font-size: 12px;
            line-height: 1;
        }
        .xb-msg-action:hover:not(:disabled) {
            color: var(--accent-dark);
            background: rgba(255, 255, 255, .86);
        }
        .xb-agent-main.is-busy .xb-msg-action:not([data-message-action="cancel-edit"]) {
            opacity: .5;
            pointer-events: none;
        }
        .xb-msg-content {
            margin: 0;
            min-width: 0;
            max-width: 100%;
            box-sizing: border-box;
            white-space: pre-wrap;
            word-break: break-word;
            font: inherit;
        }
        .xb-assistant-markdown {
            min-width: 0;
            max-width: 100%;
            white-space: normal;
            line-height: 1.7;
            overflow-wrap: anywhere;
        }
        .xb-assistant-markdown > *:first-child { margin-top: 0; }
        .xb-assistant-markdown > *:last-child { margin-bottom: 0; }
        .xb-assistant-markdown p,
        .xb-assistant-markdown ul,
        .xb-assistant-markdown ol,
        .xb-assistant-markdown pre,
        .xb-assistant-markdown blockquote,
        .xb-assistant-markdown table,
        .xb-assistant-markdown h1,
        .xb-assistant-markdown h2,
        .xb-assistant-markdown h3,
        .xb-assistant-markdown h4 {
            margin: 0 0 0.8em;
        }
        .xb-assistant-markdown code {
            padding: 0.12em 0.38em;
            border-radius: 8px;
            background: rgba(20, 32, 51, 0.08);
            font-family: "Cascadia Code", "Consolas", monospace;
            font-size: 0.95em;
        }
        .xb-assistant-markdown pre {
            overflow-x: hidden;
            overflow-y: visible;
            min-width: 0;
            max-width: 100%;
            box-sizing: border-box;
            padding: 12px 14px;
            border-radius: 12px;
            background: rgba(20, 32, 51, 0.06);
            white-space: pre-wrap;
            word-wrap: break-word;
            word-break: break-all;
        }
        .xb-assistant-codeblock {
            position: relative;
            min-width: 0;
            max-width: 100%;
        }
        .xb-assistant-codeblock .xb-assistant-code-copy {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 24px;
            height: 24px;
            border: none;
            border-radius: 8px;
            background: rgba(20, 32, 51, 0.14);
            color: #36567b;
            cursor: pointer;
            font: 600 12px/1 "Segoe UI Emoji", "Apple Color Emoji", sans-serif;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 0.8;
        }
        .xb-assistant-codeblock .xb-assistant-code-copy:hover {
            background: rgba(20, 32, 51, 0.22);
            opacity: 1;
        }
        .xb-assistant-codeblock pre {
            padding-top: 34px;
        }
        .xb-markdown-html-block {
            display: grid;
            gap: 10px;
            margin: 0 0 0.8em;
            padding: 12px;
            border: 1px solid rgba(64, 52, 36, .14);
            border-radius: 12px;
            background: rgba(255, 255, 255, .42);
        }
        .xb-markdown-html-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .xb-markdown-html-title {
            display: grid;
            gap: 2px;
            color: var(--accent-dark);
            font-size: 12px;
            font-weight: 800;
        }
        .xb-markdown-html-title span {
            color: var(--muted);
            font-size: 11px;
            font-weight: 500;
        }
        .xb-markdown-html-actions {
            display: inline-flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: flex-end;
        }
        .xb-markdown-html-actions button {
            padding: 5px 9px;
            border-radius: 999px;
            background: rgba(255, 255, 255, .70);
            color: var(--accent-dark);
            font-size: 12px;
            font-weight: 800;
            line-height: 1.1;
        }
        .xb-markdown-html-actions button.is-active {
            background: rgba(173, 90, 43, .14);
        }
        .xb-markdown-html-body {
            min-width: 0;
        }
        .xb-markdown-html-code {
            max-height: 320px;
            overflow: auto;
            margin: 0;
            padding: 12px 14px;
            border-radius: 10px;
            background: rgba(20, 32, 51, 0.06);
            white-space: pre-wrap;
            word-break: break-all;
            font: 12px/1.55 "Cascadia Code", "Consolas", monospace;
        }
        .xb-markdown-html-preview {
            width: 100%;
            height: 320px;
            box-sizing: border-box;
            border: 1px solid rgba(64, 52, 36, .14);
            border-radius: 10px;
            background: #fff;
        }
        .xb-assistant-markdown pre code {
            padding: 0;
            background: transparent;
        }
        .xb-assistant-markdown blockquote {
            padding-left: 12px;
            border-left: 3px solid rgba(27, 55, 88, 0.24);
            color: #4b5a70;
        }
        .xb-assistant-markdown table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.95em;
        }
        .xb-assistant-markdown th,
        .xb-assistant-markdown td {
            border: 1px solid rgba(27, 55, 88, 0.18);
            padding: 6px 10px;
            text-align: left;
            vertical-align: top;
        }
        .xb-assistant-markdown th {
            background: rgba(20, 32, 51, 0.06);
            font-weight: 600;
        }
        .xb-assistant-markdown a {
            color: #285786;
            text-decoration: underline;
        }
        .xb-assistant-markdown ul,
        .xb-assistant-markdown ol {
            padding-left: 1.4em;
        }
        .xb-msg-editor-wrap { min-width: 0; }
        .xb-msg-editor {
            width: 100%;
            min-height: 104px;
            box-sizing: border-box;
            resize: vertical;
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 10px 12px;
            background: rgba(255,255,255,.70);
            color: var(--ink);
            font: 13px/1.6 "Microsoft YaHei", sans-serif;
        }
        .xb-msg-editor:focus {
            outline: none;
            border-color: rgba(173, 90, 43, .46);
            box-shadow: 0 0 0 3px rgba(173, 90, 43, .12);
        }
        .xb-thought-details {
            margin: 4px 0 7px;
            color: var(--muted);
            font-size: 12px;
        }
        .xb-thought-details summary {
            cursor: pointer;
            color: var(--green);
            font-weight: 800;
            list-style: none;
        }
        .xb-thought-details summary::-webkit-details-marker { display: none; }
        .xb-thought-details summary::marker { content: ''; }
        .xb-thought-details[open] { display: grid; gap: 6px; }
        .xb-thought-block {
            border-left: 3px solid rgba(89, 116, 74, .36);
            padding: 6px 8px;
            background: rgba(255,255,255,.32);
            border-radius: 10px;
        }
        .xb-thought-label { font-weight: 800; color: var(--green); margin-bottom: 4px; }
        .xb-thought-block pre {
            margin: 0;
            white-space: pre-wrap;
            font: 12px/1.55 "Microsoft YaHei", sans-serif;
            color: var(--muted);
        }
        .xb-tool-trace {
            border: none;
            border-radius: 0;
            padding: 0;
            background: transparent;
            color: var(--muted);
            font-size: 12px;
        }
        .xb-tool-trace summary {
            cursor: pointer;
            color: var(--accent-dark);
            font-weight: 800;
            list-style: none;
            display: grid;
            grid-template-columns: auto auto 1fr;
            align-items: center;
            gap: 8px;
            padding: 2px 0 0;
        }
        .xb-tool-trace summary::-webkit-details-marker { display: none; }
        .xb-tool-trace summary::after {
            content: '';
            height: 1px;
            background: rgba(173, 90, 43, .34);
        }
        .xb-tool-fold-indicator::before { content: '›'; }
        .xb-tool-trace[open] .xb-tool-fold-indicator::before { content: '∨'; }
        .xb-tool-trace summary::marker { content: ''; }
        .xb-tool-trace[open] { display: grid; gap: 6px; }
        .xb-tool-trace[open] summary { color: var(--accent-dark); }
        .xb-tool-trace-body { display: grid; gap: 6px; padding-top: 4px; }
        .xb-tool-trace-note { color: var(--muted); font-size: 11px; }
        .xb-tool-round { display: grid; gap: 6px; }
        .xb-tool-round + .xb-tool-round { padding-top: 6px; border-top: 1px solid rgba(173, 90, 43, .16); }
        .xb-tool-round-title { color: var(--accent-dark); font-weight: 800; font-size: 12px; }
        .xb-tool-preface {
            white-space: pre-wrap;
            border-left: 3px solid rgba(173, 90, 43, .28);
            padding: 7px 9px;
            background: rgba(255,255,255,.36);
            border-radius: 10px;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.55;
        }
        .xb-tool { border-left: 3px solid var(--green); padding: 7px 9px; background: rgba(255,255,255,.40); border-radius: 10px; font-size: 12px; }
        .xb-tool.is-error { border-left-color: #a33; }
        .xb-agent-form {
            display: grid;
            gap: 8px;
            border: 1px solid rgba(64, 52, 36, .10);
            border-radius: 18px;
            padding: 10px;
            background: rgba(255, 255, 255, .46);
            box-shadow: 0 12px 30px rgba(80, 48, 24, .08);
        }
        .xb-agent-compose-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: stretch; }
        .xb-agent-compose-main { display: grid; gap: 6px; min-width: 0; }
        .xb-agent-compose-actions { display: flex; align-items: center; justify-content: center; width: 40px; }
        #xb-agent-input { min-height: 66px; max-height: 150px; resize: vertical; border: 1px solid var(--line); border-radius: 14px; padding: 10px; background: rgba(255,255,255,.68); color: var(--ink); font: 13px/1.5 "Microsoft YaHei", sans-serif; }
        .xb-compose-hint { color: var(--muted); font-size: 11px; line-height: 1.4; padding-left: 4px; }
        .xb-agent-form button {
            width: 38px;
            min-width: 38px;
            height: 38px;
            min-height: 38px;
            padding: 0;
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: var(--accent);
            color: #fff8ed;
            border-color: transparent;
            font-weight: 800;
            font-size: 18px;
        }
        .xb-agent-form button.is-busy { background: var(--accent-dark); }
        .xb-toast { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); padding: 10px 16px; border-radius: 999px; background: rgba(35, 27, 20, .88); color: #fff8ed; box-shadow: var(--shadow); }
        @keyframes xb-ebook-pulse {
            0% { box-shadow: 0 0 0 0 rgba(173, 90, 43, .32); }
            70% { box-shadow: 0 0 0 8px rgba(173, 90, 43, 0); }
            100% { box-shadow: 0 0 0 0 rgba(173, 90, 43, 0); }
        }
        @media (max-width: 920px) {
            .xb-ebook-shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(760px, 1fr); overflow: auto; }
            .xb-studio-workbench { grid-template-columns: 1fr; grid-template-rows: minmax(380px, 1fr) minmax(360px, 42vh); }
            .xb-sidebar, .xb-agent, .xb-editor { min-height: 360px; }
            .xb-sidebar { grid-template-rows: auto minmax(260px, 1fr); border-right: none; border-bottom: 1px solid var(--line); }
            .xb-agent { border-left: none; border-top: 1px solid var(--line); }
            .xb-guide-grid { grid-template-columns: 1fr; }
            .xb-library-hero, .xb-entry-hero { align-items: stretch; flex-direction: column; }
            .xb-entry-actions, .xb-reader-main { grid-template-columns: 1fr; }
            .xb-reader-main { overflow: auto; }
            .xb-reader-paper { padding: 28px; }
        }
    `;
    document.head.appendChild(style);
}
