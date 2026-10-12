# Misskey – AI Agent Guide

本文件汇总在 Misskey 仓库中工作的 AI 编程代理（Claude Code / OpenAI Codex / GitHub Copilot 等）共同参照的**仓库操作约束和最低限度检查**，作为索引使用。通过以下 3 条路径被参照和读取：

- **Claude Code**：由根目录的 `CLAUDE.md` 通过 `@AGENTS.md` 引入。详细步骤和规范位于 `.claude/skills/`（由 description 自动索引）
- **OpenAI Codex**：直接读取根目录的 `AGENTS.md`（skill 入口位于 `.agents/skills/`，实际内容指向 `.claude/skills/`）
- **GitHub Copilot**：通过 `.github/copilot-instructions.md`（为 Copilot code review 重新列出本文件规范）参照

面向人工 contributor 的一般规范（Issue / PR 的提交方式、ActivityPub 扩展等）请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。本文件只聚焦于 AI 在**编写、修复和交付代码**时不应逾越的事项。

---

## 仓库操作约束

以下约束用于避免 CI 失败、生产环境事故和共享环境受损，请遵守。

### 代码与数据

1. **不得在缺少 SPDX 头的情况下向 AGPL 管辖目录新增文件**
   - 对象：新建 `.ts` / `.js` / `.cjs` / `.mjs` / `.vue` / `.scss` / `.html` 文件
   - 对象范围和判定由 [scripts/check-spdx.mjs](scripts/check-spdx.mjs) 统一管理
   - 运行一次 `node scripts/check-spdx.mjs`，缺失部分用 `--fix` 补齐。
     输出 `SPDX: OK` 后不再做额外目视确认
   - `packages/misskey-js` 是 MIT 许可的子包，因此不统一添加该 AGPL 头（遵循子包自身的 `package.json` / `LICENSE` / 既有文件头）

2. **除 `locales/zh-CN.yml` 外，不得手动编辑其他 locale YAML**
   - 其他语言文件（例如 `en-US.yml`，即除 `zh-CN.yml` 外的全部文件）是 Crowdin 的自动分发目标，手动编辑会在下次同步时被覆盖丢失
   - 依据：[locales/README.md](locales/README.md) 和 [crowdin.yml](crowdin.yml)（`zh-CN.yml` → `locales/%locale%.yml` 的同步配置）

3. **不得编辑已合并的 migration 文件**
   - 对象：`packages/backend/migration/{unixMs}-{name}.js` 中已经合并进 `develop` / `master` 的文件
   - 在生产环境中发生历史改写会引发严重的数据不一致
   - 需要变更 schema 时，**用新的时间戳创建新文件**（用 `node -e "console.log(Date.now())"` 获取时间戳）
   - 新建 migration 必须同时实现 `up()` 和 `down()`，并通过 `pnpm --filter backend check-migrations`（用 TypeORM schema builder 检测 pending DDL）

### Git / 仓库操作

4. **不得对 `main` / `develop` / `master` 覆盖远端历史**（包括带 lease 的强制推送在内，可能抹掉他人的工作）
5. **不得跳过 hook 进行提交**
6. **不得改写已合并或已推送的 commit**（会破坏历史一致性）
7. **不得强制重置或删除他人的分支**
8. **不得未经用户同意修改 `git config`**（特别是 `user.name` / `user.email` / `commit.gpgsign`）

### Issue / PR / 外部发送

9. **未经用户明确指示，不得合并、关闭 PR，也不得对 PR 分支覆盖远端历史**
10. **未经用户明确指示，不得向 external service（GitHub comments / Slack / 邮件 等）发送内容**
11. **不得将 secrets / 认证信息提交到仓库**（`.config/*.yml` 的生产值、`.env` 文件、访问令牌、密钥材料等）
12. **不得通过普通的 Issue / PR 途径报告安全问题**（此类报告的规则请参阅 `creating-issues-and-prs` skill）

### skill 调用

以下要求同样适用于已执行上游 skill、已具备相关知识或存在 memory 记录的情况。

13. **未参照 `working-on-backend` skill，不得编辑或新增 `packages/backend/` 下的文件**
14. **未参照 `working-on-frontend` skill，不得编辑或新增 `packages/frontend/` 下的文件**
15. **未参照 `shipping-misskey-change` skill，不得进行 commit / 创建 PR / 将工作交还用户**
16. **未参照 `creating-issues-and-prs` skill，不得提交 Issue / PR**（也包含安全问题报告的规则）

### 左右双列导航布局

17. **带左侧菜单、右侧内容的页面，统一参考控制面板和用户设置的父子路由设计**
   - 外层父布局保留左侧导航，只通过 `NestedRouterView` 切换右侧内容，不得随子页面切换重建左侧头像和菜单。
   - 每个页面菜单项必须有独立 URL，支持直接访问、刷新和浏览器前进后退；选中状态由路由驱动，不得只靠组件内变量切换。
   - 复用 `_pageLayout`、`_pageLayoutWithSidebar`、`_pageNavigation`、`_pageContent` 的双列及独立滚动规则；手动检查窄屏和菜单切换时无布局抖动，不为此新增像素测试。
   - 双列内容区统一为 1040px，由公共样式控制，不在页面中单独写 1200px。
   - 刷新首屏按路由使用最终宽度，不等待异步组件、页面元数据或用户资料加载后再调整。

### 中文表达

18. **使用简体中文，措辞简洁、意思清楚**
   - 注释说明问题或原因，避免重复代码；界面文案用常用词，保留必要信息，避免重复说明。

### 测试与执行效率

19. **按风险验证，不把每次改动都变成新增测试的任务**
   - 先判断行为和影响范围，再在相关模块查找已有覆盖；不因“新增功能”“修复 bug”或改了代码就自动创建测试。风险不按代码行数判断。

   | 变更 | 默认验证 | 新增测试 |
   | --- | --- | --- |
   | 文档、文案、纯样式、不改变行为的机械重构 | 适用的静态检查；影响界面时检查代表性页面 | 默认不新增 |
   | 普通小功能：复用已有逻辑的展示、交互或接线，不改变下行所列关键行为 | 运行相关已有测试；没有合适测试时，做定向功能验证，确认正常流程和受影响的边界 | 默认不新增用例或文件 |
   | 权限、资金、数据写入、并发、复杂状态或已知逻辑故障 | 定向验证关键行为及失败路径；验证必须能发现对应风险 | 现有覆盖不足时，补最小必要的回归用例 |

   - 用户明确要求测试时按要求执行。除此之外，新增前先用一句话说明“可能回归的行为，以及现有验证为何不足”；说不出具体风险，不以“更稳妥”或完成清单为由补测试。默认不新增不等于不验证；无法执行功能验证时明确说明缺口，不宣称功能已验证。
   - 必须补用例时优先复用现有文件，只有独立行为需要单独组织才新建。不为凑测试单独拆分生产代码、引入测试框架或搭建复杂 mock；不要只断言源码文字、类名或固定像素来复述实现。
   - 选择能覆盖风险的最轻验证层，不默认叠加 unit、browser、e2e、联邦和全量构建；后端 API 生成、migration 等专用检查仍按下文执行。按文件或用例一次运行相关集合，必要检查通过后即停止；只有影响验证结果的新改动、失败或明确未解决的风险才重跑或扩大范围。
   - 多代理协作时由一个代理汇总执行验证，其他代理提供检查建议并复用结果；对同一版本、同一范围已通过的检查，不因进入审查或交付阶段再跑一次。
   - 本任务的 lint / test 只针对本任务改动；共享工作区已有的无关改动不触发重复验证。SPDX 和语言文件安全仍按下文要求检查。
   - 临时诊断脚本、测试及截图放在测试发现范围之外，结束后清理本任务创建的临时文件。长期回归测试保留；删除时确认已失效、重复或仅锁定低价值外观细节，不按新旧、是否未跟踪或耗时一刀切。

---

## 交付变更前的最低检查

各代理都应参照 [shipping-misskey-change skill](.claude/skills/shipping-misskey-change/SKILL.md)。即使在该 skill 不可用的环境下，以下检查也必须执行：

1. **lint / test**：将 ESLint 作为最后一步，从 package root 对本任务适用的变更文件运行一次 `eslint --quiet`；测试按第 19 条选择，普通小功能默认复用已有测试或定向功能验证，关键行为缺少覆盖才补用例。仅文档变更且无适用文件时跳过 ESLint 和业务测试。
   整个 package / repo 的 lint 和广域 test 按需运行，定向验证通过后不再例行追加。
2. **变更后端 API 时**：运行 `pnpm build-misskey-js-with-types`，并将 `packages/misskey-js/src/autogen/` 的差异一并纳入 commit
3. **变更 entity / migration 时**：`pnpm --filter backend check-migrations` 以 pending DDL 0 件通过 / 新建 migration 已同时实现 `up()` 和 `down()`
4. **SPDX**：确认 `node scripts/check-spdx.mjs` 返回 `SPDX: OK`
5. **语言文件安全**：确认已提交、未提交和未跟踪的全部变更集合中不存在除 `locales/zh-CN.yml` 以外的 locale YAML
6. **[CHANGELOG](.claude/skills/shipping-misskey-change/references/tasks/changelog-update.md)**：除用户明确要求外不进行编辑。
   存在用户影响的变更，只在交接信息中给出一行候选内容

### Validation commands

默认使用下面的文件筛选命令（将 `<file>` 换成实际文件，可同时传入多个路径）；省略路径会运行整套测试，仅在需要时使用。后端脚本包含构建，相关文件应合并到一次调用中。

| 用途 | 命令 |
| --- | --- |
| 全仓 lint（任选） | `pnpm lint` |
| Backend unit test | `pnpm --filter backend test --run test/unit/<file>.ts` |
| Backend e2e test（按需） | `pnpm --filter backend test:e2e --run test/e2e/<file>.ts` |
| Backend federation test（按需） | `pnpm --filter backend test:fed --run <file>` |
| Frontend unit test | `pnpm --filter frontend test test/unit/<file>.test.ts` |
| Frontend browser test（按需） | `pnpm --filter frontend test:browser test/browser/<file>.test.ts` |
| Migration 差异检查（pending DDL） | `pnpm --filter backend check-migrations` |
| `misskey-js` 重新生成（API 变更后必须） | `pnpm build-misskey-js-with-types` |
| 全量 build | `pnpm build` |
| 开发服务器（backend + frontend watch） | `pnpm dev` |

**注意：** 运行 backend test（`test` / `test:e2e` / `test:fed`）前需要 `.config/test.yml`（用 `ncp .github/misskey/test.yml .config/test.yml` 或 `cp .github/misskey/test.yml .config/test.yml` 创建）。
