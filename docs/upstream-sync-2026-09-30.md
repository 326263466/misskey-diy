# 2026-09-30 上游合并记录

来源：`D:/develop/workspace/projects/misskey`，来源工作区干净。

来源提交：`721948c7e7fa31e9f3d47e0c2fc8e1a9e6def9ec`，北京时间 2026-09-29 19:18:28。
共同祖先：`2b55af9c78346435671d63227a384139cf1e9d40`。
比较了当前 HEAD 尚未包含的全部 **26 条历史提交、43 个变更文件**，不是只比较最新提交。

采用三方文件合并，保留当前已提交及未提交的定制。未创建提交或更改分支历史，因此这些上游提交尚未成为当前 HEAD 的祖先；本记录用于避免下次重复核对。

## 本次新合入

- 版本更新为 `2026.9.2-alpha.0`（主项目、misskey-js）。
- 剪藏重复移除帖子的计数修复及回归测试。
- HTTP Signature request-target 纳入查询字符串及空问号边界，更新签名测试。
- MkModal 子元素空值保护、自定义表情回调 inject 默认值。
- 后端 e2e sourcemap、覆盖率初始化、错误堆栈映射修复。
- 自动合入缺失的 Crowdin 更新、上游发布记录，重新生成 SDK API 类型并保留本地新增 API。

## 本地已包含并保留

- nodemailer 9.1.1 安全升级及锁文件配置。
- 2026.9.1 安全修复、数据库参数化、API/注册/文件/流订阅加固。
- 远程帖子清理游标续跑、MFM 子 VNode 复用、Windows shipping 修复。
- 本地文字反应、在线状态、订阅、注册等定制。
- ReactionsBufferingService 保留更稳妥的嵌套 jsonb_set；文件响应保留按实际变体大小处理。

## UI

- 话题仅趋势推荐、主题色、单选、328px；最多显示5项，超过后滚动。
- Boost 默认左对齐，超出帖子容器且右对齐能容纳时切换；容器过窄时按屏幕边界回退，响应容器尺寸变化。

## 验证

- PASS：前端上游/话题回归4文件63项；Boost/弹层回归3文件58项（两个集合有重叠，不应直接相加）。
- PASS：后端 ap-request、boost-reactions 共20项。
- PASS：`pnpm build-misskey-js-with-types`（首次遇到临时生成文件竞争，重试完成）。
- PASS：`pnpm --filter backend build:e2e`。
- 环境限制：ReactionService 24项因测试 PostgreSQL 54312/Redis 56312 未启动而未通过；clips e2e 同样待服务就绪。本机未发现 Docker 命令。

复测数据库相关功能：

```powershell
docker compose -f packages/backend/test/compose.yml up -d
pnpm --filter backend test --run test/unit/ReactionService.ts
pnpm --filter backend test:e2e --run test/e2e/clips.ts
```

手工复测：时间线右侧展开 Boost 应改为右对齐；左侧默认左对齐；窄窗口内不超出屏幕。话题图标随主题变化，第6项起滚动，选中后不能再添加第二个。

## 交付检查

- PASS：ESLint 支持的本次前后端源码与测试文件。
- 配置限制：上游 test-server/entry.ts、vitest.config.e2e.ts 不在现有 ESLint 的 TypeScript project 内；二者通过 build:e2e 编译检查。
- PASS：SPDX（仓库2823个文件）。
- 全仓检查限制：前端453个变更文件触发 Windows 命令长度上限；多语言检查会同时标记原有改动及本次自动合入的 Crowdin 文件，未据此人工改写翻译。
- 更新日志候选：同步上游修复，并优化话题推荐和 Boost 面板边界定位。

## 全部43文件核对

| 上游文件 | 处理 |
|---|---|

| `CHANGELOG.md` | 本次合入，保留本地差异 |
| `locales/en-US.yml` | 已包含上游修复，保留本地实现 |
| `locales/id-ID.yml` | 本次合入，保留本地差异 |
| `locales/it-IT.yml` | 本次合入，保留本地差异 |
| `locales/ru-RU.yml` | 已包含上游修复，保留本地实现 |
| `locales/uk-UA.yml` | 已包含上游修复，保留本地实现 |
| `locales/zh-CN.yml` | 本次合入，保留本地差异 |
| `package.json` | 本次合入，保留本地差异 |
| `packages/backend/package.json` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/core/ChatService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/core/ClipService.ts` | 本次合入，保留本地差异 |
| `packages/backend/src/core/PollService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/core/ReactionService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/core/ReactionsBufferingService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/core/activitypub/ApRequestService.ts` | 本次合入，保留本地差异 |
| `packages/backend/src/core/chart/core.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/misc/sql-string-escape.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/queue/processors/CleanRemoteNotesProcessorService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/ActivityPubServerService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/api/ApiCallService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/api/SignupApiService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/api/endpoints/federation/update-remote-user.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/api/endpoints/i/update.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/api/endpoints/notes/polls/vote.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/api/stream/Connection.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/file/FileServerDriveHandler.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/src/server/file/FileServerUtils.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/test-server/entry.ts` | 本次合入，保留本地差异 |
| `packages/backend/test/e2e/clips.ts` | 本次合入，保留本地差异 |
| `packages/backend/test/unit/ap-request.ts` | 本次合入，保留本地差异 |
| `packages/backend/test/unit/queue/processors/CleanRemoteNotesProcessorService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/test/unit/server/FileServerService.ts` | 已包含上游修复，保留本地实现 |
| `packages/backend/vitest.config.e2e.ts` | 本次合入，保留本地差异 |
| `packages/frontend/src/components/MkModal.vue` | 本次合入，保留本地差异 |
| `packages/frontend/src/components/global/MkCustomEmoji.vue` | 本次合入，保留本地差异 |
| `packages/frontend/src/components/global/MkMfm.ts` | 已包含上游修复，保留本地实现 |
| `packages/frontend/src/utility/get-user-menu.ts` | 已包含上游修复，保留本地实现 |
| `packages/misskey-js/package.json` | 本次合入，保留本地差异 |
| `packages/misskey-js/src/autogen/apiClientJSDoc.ts` | 已包含上游修复，保留本地实现 |
| `packages/misskey-js/src/autogen/types.ts` | 本次合入，保留本地差异 |
| `pnpm-lock.yaml` | 已包含上游修复，保留本地实现 |
| `pnpm-workspace.yaml` | 已包含上游修复，保留本地实现 |
| `scripts/check-shipping.mjs` | 已包含上游修复，保留本地实现 |

## 全部26条缺失历史提交

- 499e1d7d78 fix(frontend): MFMでカスタム絵文字の再描画が走る問題を修正 (#17953)
- 1510c443cd fix(backend): リモートノート削除のカーソルを保持するように (#17957)
- 38416e5401 fix: Windowsでshipping lintを実行できない問題を修正 (#17956)
- 559d7453e1 Bump version to 2026.9.1-alpha.0
- 1dca99645e Update CHANGELOG.md
- 7c149fa227 New Crowdin updates (#17951)
- b16acdcd1c Update dependency nodemailer to v9.1.1 [SECURITY] (#17932)
- ef25ce0cd1 Merge commit from fork
- c4406f41eb Merge commit from fork
- ba7f23ab03 Merge commit from fork
- 6fe2252520 Merge commit from fork
- 1967f80d24 Merge commit from fork
- ab6d188f6c Merge commit from fork
- b53c6182c8 Bump version to 2026.9.1-beta.0
- 9129a3eb98 Update CHANGELOG.md [ci skip]
- b92a94eb93 fix(backend): harden db operations (#17963)
- 7f05994f00 Release: 2026.9.1
- be56414e88 [skip ci] Update CHANGELOG.md (prepend template)
- feaa29fa06 fix: review fixes for 2026.9.1 (#17964)
- e86a3373e4 fix(backend/test): のカバレッジが正しく記録されない問題を修正 (#17981)
- 7c9c38c04a fix: include query string in HTTP Signature (request-target) (#17941)
- 4682d44cae fix(backend): クリップから同じノートを繰り返し削除すると clippedCount が負数になる問題の修正 (#17974)
- fb16c7f385 fix(frontend): MkModal初期化時に要素が存在しない場合エラーが発生しうる問題を修正 (#17968)
- c146fd8d10 fix(frontend): カスタム絵文字でリアクションコールバックの inject 警告を解消 (#17967)
- 599e64f2a5 Bump version to 2026.9.2-alpha.0
- 721948c7e7 New Crowdin updates (#17970)
