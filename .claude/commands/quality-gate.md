---
description: 按 Misskey 变更范围执行 lint、类型检查和定向测试。默认只检查 changed 范围；全量检查必须显式选择 repo、backend 或 frontend。
argument-hint: "[changed|repo|backend|frontend|<path/to/file.ts>]"
---

<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 Affaan Mustafa and everything-claude-code contributors

来源（上游）：https://github.com/affaan-m/everything-claude-code (v2.0.0-rc.1)
上游路径：commands/quality-gate.md
上游许可证：MIT — https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE
项目声明：见 .claude/THIRD_PARTY_LICENSES.md

Misskey 在 2026-05-10 引入。本文件只保留 Misskey 的 pnpm、TypeScript、ESLint 和 Vitest 流程；formatter 已移除，e2e / federation / Playwright 按风险单独执行。
-->

# /quality-gate — Misskey 定向质量检查

使用 `/quality-gate [scope]`。不确定范围时使用 `changed`，只有明确需要全量状态时才选择 `repo`、`backend` 或 `frontend`。交付前的变更文件 lint 和仓库安全检查由 [shipping-misskey-change](../skills/shipping-misskey-change/SKILL.md) 统一收口。

## 范围

- `changed`（默认）：变更文件 lint、SPDX、语言文件安全检查，以及按风险选择的定向类型检查或已有测试；不自动运行全量 unit test
- `repo`：所有 workspace 的 lint、类型检查和 backend / frontend unit test
- `backend`：只检查 `packages/backend`
- `frontend`：只检查 `packages/frontend`
- `path/to/file.ts`：在对应 package root 对单个文件运行 `eslint --quiet`

## changed 流程

工作区全部变更属于本任务时，先运行：

```bash
node scripts/check-shipping.mjs
```

共享工作区混有其他任务时，只对本任务文件运行等价的定向 lint，并对完整变更集合检查 SPDX 和语言文件安全。然后按 AGENTS.md 第 19 条选择一个最接近的 typecheck、unit、browser、e2e 或 federation 命令；已有覆盖充分，或改动属于文档、文案、纯样式和机械重构时，可记录业务测试 `SKIPPED` 及理由。必要检查通过后停止，不为完成清单追加全量测试。

## repo 流程

各 package 的 `lint` 已包含 typecheck 和 ESLint。需要全量 repo 检查时独立执行并收集所有结果：

```bash
pnpm --no-bail -r lint
pnpm check-dts
pnpm --filter backend test
pnpm --filter frontend test
```

## backend / frontend 流程

只有明确选择 package 全量检查时才运行以下命令：

```bash
pnpm --filter backend lint
pnpm --filter backend test

pnpm --filter frontend lint
pnpm --filter frontend test
```

e2e、federation、browser 测试不由本命令自动追加，按变更风险定向执行。

## 单文件流程

```bash
(cd packages/backend && pnpm exec eslint --quiet -- src/path/to/file.ts)
(cd packages/frontend && pnpm exec eslint --quiet -- src/path/to/component.vue)
```

## 输出

逐项保留退出码并标记 `PASS / FAIL / BASELINE / SKIPPED`。只有确认基础分支也有同一失败且与本次变更无关时才使用 `BASELINE`；未执行项目必须写明原因。
