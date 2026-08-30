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

2. **除 `locales/ja-JP.yml` 外，不得手动编辑其他 locale YAML**
   - 其他语言文件（例如 `en-US.yml`，即除 `ja-JP.yml` 外的全部文件）是 Crowdin 的自动分发目标，手动编辑会在下次同步时被覆盖丢失
   - 依据：[locales/README.md](locales/README.md) 和 [crowdin.yml](crowdin.yml)（`ja-JP.yml` → `locales/%locale%.yml` 的同步配置）

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

---

## 交付变更前的最低检查

各代理都应参照 [shipping-misskey-change skill](.claude/skills/shipping-misskey-change/SKILL.md)。即使在该 skill 不可用的环境下，以下检查也必须执行：

1. **lint / test**：将 ESLint 作为最后一步，从 package root 对适用的变更文件运行一次 `eslint --quiet`；涉及实现变更时选择并运行最接近的 test。
   整个 package / repo 的 lint 和广域 test 为任选项
2. **变更后端 API 时**：运行 `pnpm build-misskey-js-with-types`，并将 `packages/misskey-js/src/autogen/` 的差异一并纳入 commit
3. **变更 entity / migration 时**：`pnpm --filter backend check-migrations` 以 pending DDL 0 件通过 / 新建 migration 已同时实现 `up()` 和 `down()`
4. **SPDX**：确认 `node scripts/check-spdx.mjs` 返回 `SPDX: OK`
5. **locale safety**：确认已 commit、未 commit 和 untracked 的全部变更集合中不存在除 `locales/ja-JP.yml` 以外的 locale YAML
6. **[CHANGELOG](.claude/skills/shipping-misskey-change/references/tasks/changelog-update.md)**：除用户明确要求外不进行编辑。
   存在用户影响的变更，只在交接信息中给出一行候选内容

### Validation commands

各项检查所用的 pnpm 命令一览。请根据情况从最接近的命令开始验证。

| 用途 | 命令 |
| --- | --- |
| 全仓 lint（任选） | `pnpm lint` |
| Backend unit test | `pnpm --filter backend test` |
| Backend e2e test | `pnpm --filter backend test:e2e` |
| Backend federation test | `pnpm --filter backend test:fed` |
| Frontend unit test | `pnpm --filter frontend test` |
| Migration 差异检查（pending DDL） | `pnpm --filter backend check-migrations` |
| `misskey-js` 重新生成（API 变更后必须） | `pnpm build-misskey-js-with-types` |
| 全量 build | `pnpm build` |
| 开发服务器（backend + frontend watch） | `pnpm dev` |

**注意：** 运行 backend test（`test` / `test:e2e` / `test:fed`）前需要 `.config/test.yml`（用 `ncp .github/misskey/test.yml .config/test.yml` 或 `cp .github/misskey/test.yml .config/test.yml` 创建）。
