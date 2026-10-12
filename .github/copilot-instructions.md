# Misskey Copilot 规则

本文件供 GitHub Copilot code review 使用；Codex 和其他代理以根目录 `AGENTS.md` 为正本。所有审查意见和交接信息使用简体中文，命令、路径、代码和已有测试名称保持原样。

## 必须遵守

- 向 AGPL 管辖目录新增 `.ts` / `.js` / `.cjs` / `.mjs` / `.scss` / `.vue` / `.html` 文件时添加 SPDX 头；`packages/misskey-js` 遵循自身 MIT 规则。使用 `node scripts/check-spdx.mjs` 验证，不重复目视检查。
- 只能手动编辑 `locales/zh-CN.yml`；其他 locale YAML 由 Crowdin 管理。
- 不得修改已合并 migration；schema 变化新建带时间戳的 migration，并实现 `up()` 和 `down()`。
- 不向 `main`、`develop`、`master` 强制推送，不跳过 hook，不改写已合并或已推送 commit，不删除他人分支，不擅自修改 git config。
- 未经用户明确指示，不合并或关闭 PR，不向 GitHub、Slack、邮件等外部服务发送内容。
- 不提交 secrets、token、私钥、生产配置或 `.env`。

## 测试和效率

- 普通小功能（复用已有逻辑的展示、交互或接线，且不改变关键行为）默认不新增测试用例或文件。先运行相关已有测试；没有合适覆盖时做定向功能验证，确认正常流程和受影响边界。
- 权限、资金、数据写入、并发、复杂状态和已知逻辑故障必须有能发现对应风险的覆盖；现有覆盖不足才补最小回归用例。
- 新增或建议补测试前说明具体回归风险和现有验证缺口。优先复用已有文件，独立行为才新建文件；不为凑数量拆分生产代码或搭建复杂 mock。
- 文档、文案、纯样式和机械重构默认不新增测试；固定像素、类名或源码文字断言不能替代行为验证。
- 按文件或用例定向运行一次相关集合，必要检查通过后停止。同一版本、同一范围的结果在实施、审查和交付间复用；browser、e2e、federation 和全量 build 按风险选择。
- 共享工作区的无关改动不触发本任务重复 lint / test；SPDX 和语言文件安全仍检查完整变更集合。

## 交付前最低检查

1. 从 package root 对本任务仍存在的 ESLint 适用文件最后运行一次 `eslint --quiet`。仅文档变更且无适用文件时跳过。
2. backend API 的 `meta` / `paramDef` / `res` 变化运行 `pnpm build-misskey-js-with-types`，并保留 `packages/misskey-js/src/autogen/` 差异。
3. entity 或 migration 变化运行 `pnpm --filter backend check-migrations`；新 migration 同时实现 `up()` / `down()`。
4. 运行 `node scripts/check-spdx.mjs`，结果必须为 `SPDX: OK`。
5. 检查已提交、未提交和未跟踪变更中不存在 `locales/zh-CN.yml` 以外的 locale YAML。
6. 除用户明确要求外不编辑 CHANGELOG；有用户影响时在交接中提供一行候选内容。

## 常用命令

- Backend unit：`pnpm --filter backend test --run test/unit/<file>.ts`
- Backend e2e（按需）：`pnpm --filter backend test:e2e --run test/e2e/<file>.ts`
- Backend federation（按需）：`pnpm --filter backend test:fed --run <file>`
- Frontend unit：`pnpm --filter frontend test test/unit/<file>.test.ts`
- Frontend browser（按需）：`pnpm --filter frontend test:browser test/browser/<file>.test.ts`
- 全量检查只有明确需要时运行：`pnpm lint` 或 `pnpm build`

运行 backend 测试前确认 `.config/test.yml` 存在；可从 `.github/misskey/test.yml` 复制。完整风险分级和交付流程见 [AGENTS.md](../AGENTS.md) 与 [shipping-misskey-change](../.claude/skills/shipping-misskey-change/SKILL.md)。