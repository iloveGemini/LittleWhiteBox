export const EBOOK_TOOL_NAMES = Object.freeze({
    LS: 'LS',
    GLOB: 'Glob',
    GREP: 'Grep',
    READ: 'Read',
    WRITE: 'Write',
    APPLY_PATCH: 'apply_patch',
    DELETE: 'Delete',
    MOVE: 'Move',
    PLAN_CREATE: 'PlanCreate',
    PLAN_UPDATE: 'PlanUpdate',
    PLAN_LIST: 'PlanList',
    PLAN_GET: 'PlanGet',
    RENAME_BOOK: 'RenameBook',
    DELEGATE_RUN: 'DelegateRun',
});

export function getEbookToolDefinitions(options = {}) {
    const readOnly = !!options.readOnly;
    const definitions = [
        {
            type: 'function',
            function: {
                name: EBOOK_TOOL_NAMES.LS,
                description: [
                    '列出当前书稿某个目录下的第一层文件和文件夹。',
                    '只返回目录项，不递归，也不读取文件内容。',
                    '适合在读稿或改稿前先确认章节、资料、设定、审稿文件放在哪里。',
                ].join('\n'),
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '目录路径，例如 `book/`、`book/sources/`、`book/chapters/`。' },
                        offset: { type: 'number', description: '从第几个目录项开始返回，1 起算。默认 1。' },
                        limit: { type: 'number', description: '最多返回多少个目录项。默认 100，最大 300。' },
                    },
                    required: ['path'],
                    additionalProperties: false,
                },
            },
        },
        {
            type: 'function',
            function: {
                name: EBOOK_TOOL_NAMES.GLOB,
                description: [
                    '按路径模式快速匹配当前书稿里的文件。',
                    '只匹配文件路径，不检查文件内容。',
                    '适合在已知目录、扩展名、章节编号或资料类型时缩小范围。',
                ].join('\n'),
                parameters: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: '路径匹配模式，例如 `book/**/*.md` 或 `book/chapters/*.md`。' },
                        path: { type: 'string', description: '可选的目录范围，例如 `book/chapters/`。' },
                    },
                    required: ['pattern'],
                    additionalProperties: false,
                },
            },
        },
        {
            type: 'function',
            function: {
                name: EBOOK_TOOL_NAMES.GREP,
                description: [
                    '在当前书稿文件里搜索正文内容。',
                    '默认按正则搜索，返回匹配文件和行级片段。',
                    '适合在阅读大量文件前，先定位角色名、台词、设定、伏笔、剧情点或审稿意见。',
                ].join('\n'),
                parameters: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: '搜索词；默认按正则解释，`useRegex: false` 时按普通文本搜索。' },
                        path: { type: 'string', description: '可选的搜索目录，例如 `book/chapters/`。' },
                        include: { type: 'string', description: '可选的文件匹配范围，例如 `book/chapters/*.md`。' },
                        outputMode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], description: '返回方式。默认 `content`。' },
                        limit: { type: 'number', description: '最多返回多少条结果。默认 100，最大 100。' },
                        offset: { type: 'number', description: '跳过多少条结果后再返回。默认 0。' },
                        contextLines: { type: 'number', description: '每条匹配前后附带多少行上下文。默认 0，最大 5。' },
                        useRegex: { type: 'boolean', description: '是否把 pattern 当作正则。默认 true。' },
                    },
                    required: ['pattern'],
                    additionalProperties: false,
                },
            },
        },
        {
            type: 'function',
            function: {
                name: EBOOK_TOOL_NAMES.READ,
                description: [
                    '读取当前书稿里的文本文件，或查看目录内容。',
                    '读取文件时返回带行号的内容；读取目录时返回目录项；大文件会给出继续读取提示。',
                    '需要文件末尾内容时单独使用 `tail`。',
                ].join('\n'),
                parameters: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string', description: '文件或目录路径，例如 `book/outline.md` 或 `book/chapters/`。' },
                        offset: { type: 'number', description: '从第几行或第几个目录项开始读，1 起算。默认 1。' },
                        limit: { type: 'number', description: '最多读取多少行或目录项。默认 1200，最大 2000。' },
                        tail: { type: 'number', description: '读取文件最后 N 行。需要单独使用，不要和 offset/limit 混用。' },
                    },
                    required: ['filePath'],
                    additionalProperties: false,
                },
            },
        },
    ];

    if (!readOnly) {
        definitions.push(
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.WRITE,
                    description: [
                        '写入当前书稿里的完整文本文件。',
                        '适合新建文件，或在明确需要整篇重写时覆盖整个文件。',
                        '改章节局部内容时优先用 apply_patch，避免无意覆盖已有文字。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '目标文件路径，例如 `book/chapters/001.md`。' },
                            filePath: { type: 'string', description: '`path` 的兼容别名；新调用优先使用 `path`。' },
                            content: { type: 'string', description: '要写入的完整文件内容。' },
                        },
                        required: ['path', 'content'],
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.APPLY_PATCH,
                    description: [
                        '用结构化补丁精准修改当前书稿文件。',
                        '适合局部修订、多文件修订、新增、删除或重命名书稿文件。',
                        '补丁头里的文件路径必须写成 `book/...`。',
                        '修订章节时优先用它，尽量保留没有必要改动的原文。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            patchText: { type: 'string', description: '完整补丁文本，从 `*** Begin Patch` 到 `*** End Patch`。' },
                        },
                        required: ['patchText'],
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.DELETE,
                    description: [
                        '删除当前书稿里的文件或文件夹。',
                        '可以删除单个文件，也可以删除目录及其下面的文件。',
                        '不要无必要删除正文、资料、设定或审稿意见；整理草稿时也要谨慎。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '目标文件或目录路径，例如 `book/reviews/old.md`。' },
                        },
                        required: ['path'],
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.MOVE,
                    description: [
                        '移动或重命名当前书稿里的文件或文件夹。',
                        '适合整理章节、资料、设定、审稿意见的位置或命名。',
                        '目标已存在时需要明确允许覆盖；不要把目录移动到它自己里面。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            fromPath: { type: 'string', description: '原路径，例如 `book/notes/draft.md`。' },
                            toPath: { type: 'string', description: '目标路径，例如 `book/notes/revision-plan.md`。' },
                            overwrite: { type: 'boolean', description: '目标已存在时是否允许覆盖。默认 false。' },
                        },
                        required: ['fromPath', 'toPath'],
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.PLAN_CREATE,
                    description: [
                        '为当前这本书创建一个写作计划项。',
                        '适合多步骤写作、长修订、阻塞问题或需要稍后续接的任务。',
                        '计划只记录状态，不会自动审稿、写正文或调用其他工具。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: '简短、具体的完成目标，不要写成模糊分类。' },
                            detail: { type: 'string', description: '必要背景、完成标准、目标文件或需要检查的点。' },
                            priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: '优先级。默认 normal；只有确实紧急时才提高。' },
                            owner: { type: 'string', description: '负责推进的人。默认 assistant；需要用户补材料或确认时可写 user。' },
                            blockedBy: { type: 'array', items: { type: 'string' }, description: '必须先完成的计划 id 列表。' },
                            note: { type: 'string', description: '可选的第一条进展备注或创建原因。' },
                        },
                        required: ['title'],
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.PLAN_UPDATE,
                    description: [
                        '在实际推进后更新当前书的写作计划项。',
                        '用 status 表示进度，用 note 追加简短进展，用 result/error 记录最终结果或失败原因。',
                        '只有对应写作、审稿或修订确实完成后，才标记 completed。',
                        '如果依赖项还没完成，这个计划不能进入 in_progress。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'PlanCreate 或 PlanList 返回的计划 id。' },
                            title: { type: 'string', description: '可选的新标题。' },
                            detail: { type: 'string', description: '可选的新背景或完成标准。' },
                            status: { type: 'string', enum: ['pending', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled'], description: '新的进度状态。' },
                            priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: '新的优先级。' },
                            owner: { type: 'string', description: '新的负责人。' },
                            blockedBy: { type: 'array', items: { type: 'string' }, description: '替换后的依赖计划 id 列表；传空数组表示清空依赖。' },
                            note: { type: 'string', description: '追加一条简短进展备注。' },
                            result: { type: 'string', description: '具体完成结果，通常用于 completed。' },
                            error: { type: 'string', description: '失败原因或阻塞错误，通常用于 failed。' },
                        },
                        required: ['id'],
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.PLAN_LIST,
                    description: [
                        '列出当前这本书的写作计划。',
                        '适合在续写、继续修订、避免重复计划、选择下一步或检查阻塞时使用。',
                        '不传筛选条件时返回当前计划；只在需要缩小范围时使用 status、priority 或 owner。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            status: { type: 'string', enum: ['pending', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled'], description: '可选的状态筛选。' },
                            priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: '可选的优先级筛选。' },
                            owner: { type: 'string', description: '可选的负责人筛选。' },
                            limit: { type: 'number', description: '最多返回多少项。默认 50，最大 100。' },
                        },
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.PLAN_GET,
                    description: [
                        '读取当前这本书某个计划项的完整记录。',
                        '当当前计划摘要不够，需要查看详情、依赖、备注、结果或错误时使用。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'PlanCreate 或 PlanList 返回的计划 id。' },
                        },
                        required: ['id'],
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.RENAME_BOOK,
                    description: [
                        '修改当前书的书名。',
                        '只改变书籍标题，不移动章节、资料或设定文件。',
                        '当用户要求改书名、换标题、重命名当前作品时使用。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: '新的书名。会自动去掉首尾空白，最长保留 120 字。' },
                        },
                        required: ['title'],
                        additionalProperties: false,
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: EBOOK_TOOL_NAMES.DELEGATE_RUN,
                    description: [
                        '请一个只读审稿分身独立阅读当前书稿，并把结果交回给你。',
                        '适合明确、独立、可验收的审稿、连续性检查、资料核对或问题定位。',
                        '分身只知道你写进任务、背景和交付要求里的信息，以及它自己读取到的书稿内容。',
                        '分身不能写文件、不能管理计划、不能继续委派。',
                    ].join('\n'),
                    parameters: {
                        type: 'object',
                        properties: {
                            task: { type: 'string', description: '具体审稿或核对任务。' },
                            context: { type: 'string', description: '必要背景、要看的路径、已知事实或限制。' },
                            deliverable: { type: 'string', description: '希望分身返回的结果格式、检查点或证据要求。' },
                        },
                        required: ['task'],
                        additionalProperties: false,
                    },
                },
            },
        );
    }

    return definitions;
}

export function describeEbookToolCall(name = '', args = {}) {
    switch (name) {
        case EBOOK_TOOL_NAMES.LS:
            return `查看作品目录 ${args.path || ''}`.trim();
        case EBOOK_TOOL_NAMES.GLOB:
            return `匹配作品文件 ${args.pattern || ''}`.trim();
        case EBOOK_TOOL_NAMES.GREP:
            return `搜索作品 ${args.pattern || ''}`.trim();
        case EBOOK_TOOL_NAMES.READ:
            return `读取 ${args.filePath || args.path || ''}`.trim();
        case EBOOK_TOOL_NAMES.WRITE:
            return `写入 ${args.path || args.filePath || ''}`.trim();
        case EBOOK_TOOL_NAMES.APPLY_PATCH:
            return '修订作品文件';
        case EBOOK_TOOL_NAMES.DELETE:
            return `删除 ${args.path || ''}`.trim();
        case EBOOK_TOOL_NAMES.MOVE:
            return `移动 ${args.fromPath || ''}${args.toPath ? ` -> ${args.toPath}` : ''}`.trim();
        case EBOOK_TOOL_NAMES.PLAN_CREATE:
            return `创建计划 ${args.title || ''}`.trim();
        case EBOOK_TOOL_NAMES.PLAN_UPDATE:
            return `更新计划 ${args.id || ''}`.trim();
        case EBOOK_TOOL_NAMES.PLAN_LIST:
            return '查看书籍计划';
        case EBOOK_TOOL_NAMES.PLAN_GET:
            return `查看计划 ${args.id || ''}`.trim();
        case EBOOK_TOOL_NAMES.RENAME_BOOK:
            return `修改书名 ${args.title || ''}`.trim();
        case EBOOK_TOOL_NAMES.DELEGATE_RUN:
            return `审稿分身 ${args.task || ''}`.trim();
        default:
            return `调用工具 ${name}`;
    }
}
