---
name: working-on-frontend
description: 编辑或新增 packages/frontend/、Vue SFC、SCSS、Storybook 或 locales/zh-CN.yml 中的前端文案时使用。包含前端实现规范、可访问性和按风险验证。
---

# 前端开发

编辑 `packages/frontend/` 前阅读本 skill。它是任务流程和背景知识的索引，具体规则按需阅读对应 reference；其他 skill 已执行也不能跳过。

## 按任务阅读

- 新增或大幅修改 `Mk*` 组件：阅读 [新增 Mk 组件](references/tasks/adding-mk-component.md)
- 新增或修改 i18n key：阅读 [新增 i18n key](references/tasks/adding-i18n-key.md)

## 常用参考

- Vue SFC 约定：[component-conventions](references/knowledge/component-conventions.md)
- i18n 用法：[i18n-usage](references/knowledge/i18n-usage.md)
- SCSS 模块和主题变量：[scss-modules](references/knowledge/scss-modules.md)
- UI helper：[os-api](references/knowledge/os-api.md)
- Storybook：[storybook](references/knowledge/storybook.md)
- 前端测试：[frontend-testing](references/knowledge/frontend-testing.md)

## 验证

按 [AGENTS.md 第 19 条](../../../AGENTS.md#测试与执行效率) 选择最轻验证层：先复用已有测试，普通小功能没有合适覆盖时做定向功能验证，不因改动 `.vue` 自动新增测试或浏览器测试。权限、资金、数据写入、并发、复杂状态或已知逻辑故障缺少覆盖时，补最小回归用例；真实浏览器特有的焦点、滚动、布局边界和媒体交互才使用 browser 测试；验证通过后停止。

- 类型行为变化：按需运行 `pnpm --filter frontend typecheck`
- 有适用行为覆盖：定向运行 `pnpm --filter frontend test test/unit/<file>.test.ts`
- 需要真实浏览器行为：定向运行 `pnpm --filter frontend test:browser test/browser/<file>.test.ts`
- 最后从 package root 对本任务变更文件运行 `eslint --quiet`

组件 reviewer 也按风险选择：新增共享组件、路由或双列布局、复杂 i18n / a11y / SCSS 变更时，启动 [vue-component-reviewer](../../agents/vue-component-reviewer.md)。局部文案、纯样式微调和简单接线不启动专用 reviewer。

交付前必须阅读 [shipping-misskey-change](../shipping-misskey-change/SKILL.md)。
