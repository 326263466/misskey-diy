# `.claude/agents/` — 项目专用子代理

项目专用审查和调查代理放在 `.claude/agents/<name>.md`。所有代理输出和交接信息使用简体中文；命令、路径、代码和已有测试名称保持原样。

## 角色分工

- `misskey-api-reviewer`：只做 Misskey API 的机械检查，例如 endpoint-list 接线、misskey-js 生成物、meta/paramDef/UUID。
- `vue-component-reviewer`：只做 Vue SFC 的 Misskey 约定检查，例如 Mk 命名、i18n、SCSS、os helper、a11y 和 Storybook。
- `working-on-*` skill：实现过程中的自检和参考资料。
- 通用代码质量或设计审查交给通用 reviewer，不重复执行本目录的机械检查。

## 调用原则

- reviewer 按风险调用，不因每个 `.vue` 或每个 endpoint 的小改动自动启动。
- API 的新 endpoint、API 元数据、认证权限、错误定义或 endpoint-list 接线变化，调用 API reviewer。
- 新共享组件、路由或双列布局、复杂 i18n / a11y / SCSS 变化，调用 Vue reviewer。
- 局部文案、纯样式、简单接线、服务内部委托和只改测试不调用专用 reviewer。
- 先确认变更范围；没有目标文件时直接报告无审查对象并结束。
- 多代理协作时由一个代理汇总验证结果，其他代理复用结果，不重复运行相同检查。

## 代理文件要求

- frontmatter 至少包含 `name`、`description` 和只读 `tools`；reviewer 不授予 Edit/Write。
- `description` 只保留高信号的路径、文件类型和触发条件，避免冗长内容增加上下文开销。
- 审查代理只使用读取类命令获取 baseline 和差异；不得修改文件、删除内容或向外部服务发送信息。
- 详细规范以 `.claude/skills/*/references/` 为正本；代理中的清单只是便于独立运行的副本。修改规则时先更新 reference，再同步代理清单。