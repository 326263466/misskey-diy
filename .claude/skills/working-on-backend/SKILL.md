---
name: working-on-backend
description: 编辑或新增 packages/backend/ 下的 API、NestJS 服务、TypeORM 实体、迁移、后端测试或 misskey-js 生成物时使用。包含后端实现规范、按风险验证和测试配置要求。
---

# 后端开发

编辑 `packages/backend/` 前阅读本 skill。它是任务流程和背景知识的索引，具体规则按需阅读对应 reference；其他 skill 已执行也不能跳过。

## 按任务阅读

- 新增 REST API：阅读 [新增 API endpoint](references/tasks/adding-api-endpoint.md)
- 新建数据库迁移：阅读 [创建 migration](references/tasks/creating-migration.md)

## 常用参考

- NestJS 依赖注入：[nestjs-di](references/knowledge/nestjs-di.md)
- TypeORM 实体：[typeorm-patterns](references/knowledge/typeorm-patterns.md)
- API `meta` / `paramDef` / `res`：[api-meta-paramdef](references/knowledge/api-meta-paramdef.md)
- `endpoint-list.ts` 接线：[endpoint-list](references/knowledge/endpoint-list.md)
- 后端测试前提和 helper：[backend-testing](references/knowledge/backend-testing.md)

## 验证

按 [AGENTS.md 第 19 条](../../../AGENTS.md#测试与执行效率) 选择最轻验证层：先复用已有测试，普通小功能没有合适覆盖时做定向功能验证，不因新增 endpoint 自动新增 e2e 或测试文件。权限、资金、数据写入、并发、复杂状态或已知逻辑故障缺少覆盖时，补最小回归用例；验证通过后停止。

- 修改 `meta` / `paramDef` / `res`：运行 `pnpm build-misskey-js-with-types`
- 修改实体或迁移：运行 `pnpm --filter backend check-migrations`
- 最后从 package root 对本任务变更文件运行 `eslint --quiet`
- 直接运行后端测试前确认 `.config/test.yml` 存在；相关命令见 [backend-testing](references/knowledge/backend-testing.md)

API reviewer 也按风险选择：新增 endpoint，或修改 API 元数据、认证权限、错误定义、`endpoint-list.ts` 接线时，启动 [misskey-api-reviewer](../../agents/misskey-api-reviewer.md)。服务内部委托、只改测试或机械型修正不启动专用 reviewer。

交付前必须阅读 [shipping-misskey-change](../shipping-misskey-change/SKILL.md)。
