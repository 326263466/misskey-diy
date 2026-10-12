---
name: shipping-misskey-change
description: Misskey 变更交付前使用。按风险选择验证，执行变更文件 lint、SPDX、语言文件安全和 API / 数据库专用检查，并记录 PASS、FAIL、BASELINE 或 SKIPPED。
---

# shipping-misskey-change

在 commit、创建 PR、合并或把未提交工作交还用户前使用。规范以 [AGENTS.md](../../../AGENTS.md) 为准，本文件只说明执行方式。

## 1. 验证级别

| 级别 | 条件 | 执行 |
| --- | --- | --- |
| 1（必要） | 本任务修改了 ESLint 适用文件 | 从 package root 对仍存在的变更文件运行一次 `eslint --quiet` |
| 2（按风险） | 行为变化 | 按 AGENTS.md 第 19 条复用已有测试或做定向功能验证；普通小功能默认不新增用例或文件，关键行为缺少覆盖时才补最小用例。类型、生成物和数据库变更执行对应专用检查 |
| 3（按需） | 用户明确要求、影响范围广或正在定位故障 | 执行 package / repo 全量 lint、build 或测试 |

文档、文案、纯样式和机械重构默认不触发业务测试或全量构建；删除测试或文档时先检查测试配置、残留引用和覆盖范围。若删除影响关键行为覆盖，再按风险执行定向验证。未执行的验证记录 `SKIPPED` 和理由，不能记为通过；基础分支已有的无关失败记为 `BASELINE`。

先选择能覆盖风险的最轻验证层，按文件或用例一次运行相关集合，必要检查通过后停止。同一版本、同一范围的结果在实施、审查和交付阶段复用；只有新改动、失败或未解决风险才重跑或扩大范围。多代理由一个代理汇总验证结果。

## 2. 自动检查

工作区所有变更都属于本任务时，在仓库根目录运行一次：

```bash
node scripts/check-shipping.mjs
```

需要指定集成基线时使用 `--base <ref>` 或 `MISSKEY_BASE_REF`。共享工作区混有其他任务时，不要让脚本为无关文件重复 lint；改为对本任务文件运行等价的定向 lint，并对完整变更集合检查 SPDX 和语言文件安全。

脚本会：

- NUL 安全地收集已提交、未提交和未跟踪的变更文件，只对变更文件运行 lint
- SPDX 发现本地新增文件缺少头部时，只修复本地缺失并重新检查
- 检查除了 `locales/zh-CN.yml` 之外是否有其他 locale YAML 变更

`SPDX: OK` 后不再重复目视检查。

## 3. 变更专用检查

- 修改 backend API 的 `meta` / `paramDef` / `res`：运行 `pnpm build-misskey-js-with-types`，并包含 `packages/misskey-js/src/autogen/` 差异
- 修改 entity 或 migration：运行 `pnpm --filter backend check-migrations`；新 migration 必须同时有 `up()` 和 `down()`
- 新增 endpoint，或修改 API 元数据、认证权限、错误定义、endpoint 接线：启动 [misskey-api-reviewer](../../agents/misskey-api-reviewer.md)
- 新增共享前端组件，或修改路由 / 双列布局 / 复杂 i18n、a11y、SCSS：启动 [vue-component-reviewer](../../agents/vue-component-reviewer.md)

普通服务委托、局部文案、纯样式、简单接线和只改测试不启动专用 reviewer。

## 4. 交接格式

简要列出每项检查的 `PASS / FAIL / BASELINE / SKIPPED`。失败说明与本次变更的关系；未执行说明原因。用户未要求时不要 commit、创建 PR、合并或向外部服务发送内容。
