# ChatLab 开发约定

## 任务与资料

- 按任务读取 [公开开发指南](docs/cn/contributing/development.md) 的环境、架构、验证或发布章节。存在 `.docs/` 时，可从其 README 定位相关私有上下文；公开文档和 PR 不依赖私有文档才能理解。
- 选择满足已确认需求的最简单实现，复用已有代码与依赖，按业务或平台边界组织模块。不要为假想需求增设抽象、兼容层或并行实现。
- 完成已授权的实现及相关验证，修复本次改动引入的问题；无关失败报告影响，仅在阻塞当前目标且已授权时处理。

## 审查

- 根据相关实现、调用链、测试与契约判断外部 review；依赖和框架行为查官方文档、源码或类型。结论说明位置、触发条件、用户影响与证据。
- 异步、并发、资源或性能问题须证明完整因果链和现实可达性；严重度同时考虑概率、影响和可恢复性。前后操作共享故障域时，解释为何前者失败后后者仍能造成后果。
- 同一未证实假设的下游推演不算新证据；多轮 review 按根因聚合，避免无限扩大范围。缺测试或理论极端场景本身不构成阻塞项。

## 架构与代码

- `src/` 是共享前端；`apps/desktop/` 是 Electron，`apps/cli/` 是 CLI 与 CLI Web。平台无关逻辑在 `packages/core/`，Node 运行时与共享 service 在 `packages/node-runtime/`；工具、解析器与共享路由分别在 `packages/tools/`、`packages/parser/`、`packages/http-routes/`。完整地图见开发指南。
- Electron 与 CLI Web 的共享业务优先放 `packages/node-runtime/src/services/`，路由/IPC 不绕过 core 直接写 SQL。
- 术语使用 CLI Web（Node 后端 + Web UI）和 Web WASM（纯浏览器）；无法区分的“Web”默认指 Web WASM。Browser Runtime 指 Worker、OPFS 等技术能力，不是独立平台。
- 日志、注释、工具描述与错误消息等非 UI 文本默认英文；存在运行时 locale 的返回文本通过 `isChineseLocale(locale)` 等机制支持中英。原始聊天格式标签不翻译。UI key 优先复用 `common.*`，业务专有语义才放模块；私有 i18n 约定见 `.docs/rules/i18n.md`。
- Node 日志用 `appLogger`，前端用 `src/services/log-report.ts`；AI 用 `AiLogger`，导入性能用 `perf-logger`。不另造通用 logger；记录原始 Error，禁记聊天明文或凭证。修改日志时读开发指南的 [日志约定](docs/cn/contributing/development.md#日志约定)。

## 验证

- 按改动选检查：Node/CLI/Electron 用 `pnpm run type-check:node`；Vue/前端用 `pnpm run type-check:web`；跨端或发布前用 `pnpm run type-check:all`。
- 修改文件运行 `pnpm exec eslint <files...>`、`pnpm exec prettier --write <files...>`。公开 docs 被 Prettier 默认忽略，需加 `--ignore-path .gitignore`；不为局部改动格式化全库。
- 相关测试用 `pnpm test -- path/to/file.test.ts`；完整回归用 `pnpm test` 或 `pnpm run test:unit`。通过后仅因新改动、失败或具体风险扩大或重复检查。
- 测试验证用户行为、数据和公开契约，避免源码字符串或私有实现断言。真实 Bug 和数据、迁移、导入、认证、公开 API、共享 service 的高风险改动补必要回归；已有覆盖不重复。编写测试时读 [回归测试设计](docs/cn/contributing/development.md#回归测试设计)。
- 改公开文档或 VitePress 配置运行 `pnpm docs:build`；只改私有 `.docs/` 不构建公开文档站。真实 Electron、LLM、网络和 `test:e2e:launcher` / `test:e2e:smoke` 按相关需求显式执行，不纳入默认单元测试。
- 提交前运行 `git diff --check`。

## 兼容、权限与提交

- 运行时只读写 canonical 数据结构；旧结构在迁移或加载时 normalize。保留兼容须能对应已发布版本、用户数据或公开 API，不为假想旧状态增加永久 alias/fallback/双写。
- 数据库、AI 数据、配置、数据目录与导入格式变化须验证已发布版本的升级路径，保护数据不丢失，并提供回滚或失败中断策略。
- 破坏旧运行时对同一 userDataDir 的安全读写时，提升 `.chatlab-meta.json` 最低运行时版本并接入 CLI/Desktop/MCP 启动检查；按开发指南的“数据目录兼容门禁”实施。
- 不提交凭证、聊天数据库、个人数据目录、日志或隐私截图和导出。依赖、lockfile、构建产物、发布脚本、版本、changelog、npm publish 和 release 操作须有明确授权；已有授权不重复询问。
- 功能开发使用功能分支；发版及独立 `.docs/` 仓库日常维护可在 main。Conventional Commits 的平台 scope（electron/cli/web）仅用于平台特有变更，其他使用业务模块 scope。
