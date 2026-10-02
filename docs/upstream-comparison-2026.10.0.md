# Misskey 2026.10.0 更新对比与合并选择

状态：用户已确认“合并更新，布局样式本地为主，功能合并”。上游功能更新现已合入，版本为 2026.10.0；没有提交或推送。保留本地布局、样式和全局滚动条。代码块固定不折行，删除换行图标，复制成功后 3 秒恢复复制。

上游：misskey-dev/misskey develop，`ed9654bde032199fd7530407410a56c7cf4cda75`。当前项目合并前 HEAD：`d4179fd90a8fe8dd7a2d3e35bf06bc4b4f90036d`。Git 共同祖先：`2b55af9c78346435671d63227a384139cf1e9d40`。

Git 历史范围共 43 个提交、87 个文件；不是 43 项都尚未同步。15 个文件已经包含上游内容，29 个可直接更新，21 个没有文本冲突，22 个存在文本冲突。现已按确认原则逐项处理，并同步关联依赖。

## 上游更新了什么

| 范围 | 具体更新 |
| --- | --- |
| 版本与依赖 | 主项目和 misskey-js 升至 2026.10.0；Fastify 升至 5.12.5。提交范围中也包含 Nodemailer 9.1.1 修复，当前项目已包含该版本。 |
| 隐私与权限 | 访客 UGC 可见范围、时间线/搜索/用户列表访问约束；不可见笔记从批量状态响应中排除；收藏前检查笔记可见性；聊天消息反应访问检查。 |
| 注册与认证 | 邀请码占用、待验证账号过期和回收流程修复；Passkey、OAuth 防嵌入页面保护和相关 API 检查。 |
| 推送与连接 | 退订推送需携带 auth/publickey，前端统一订阅键编码；WebSocket 消息串行处理，连接关闭时停止继续建立频道。 |
| 笔记与反应 | 剪藏重复删除不再造成负数计数；限制给纯转发添加反应；反应及队列相关 SQL 参数化。部分参数化修复本项目已有实现。 |
| 文件与联邦 | 缩略图/公开文件尺寸和 Content-Length/Range 处理；文件访问键检查、下载和流清理；HTTP Signature 包含查询字符串；远端笔记清理游标与相关测试。部分已在本项目实现。 |
| 前端 | 个人主页下拉刷新资料及时间线；弹窗初始化空元素保护；自定义表情注入/重复渲染修复；推送订阅与退出登录更新。 |
| 文档、配置、翻译 | 代理配置示例补充私网地址过滤说明；CHANGELOG；Crowdin 多语言更新；Windows 检查脚本和后端测试覆盖率配置调整。 |

## 分歧对比（确认方案的依据）

下表记录确认前的分歧。最终按本地布局、功能合并处理，在现有实现中合入修复，不添加双路径兼容分支。没有用整文件覆盖替代功能合并。

| 编号 | 当前项目 | 上游实现 / 采用上游需要接受的变化 |
| --- | --- | --- |
| A 个人主页 | 侧栏、嵌套路由、备注弹窗、公开资料同步 | 标签页和内联备注编辑，并增加下拉刷新。直接采用上游页面会替换当前页面结构。 |
| B 笔记权限和统计 | 自定义点赞、收藏、浏览量和删除回复占位符，fetchDiffs 接收用户对象 | 更严格过滤不可见笔记，fetchDiffs 接收用户 ID。直接采用该服务会替换批量状态里的本地统计实现；不能只改签名。 |
| C 反应批量计数 | 参数化 SQL，并逐层累加多个反应键，避免相互覆盖 | 参数化 SQL，但使用多个 JSONB 表达式拼接。当前实现已有额外的多键累加修正。 |
| D 文件大小 | Resolver 读取实际文件大小，包含缩略图及原文件数据库大小不一致的处理 | 缩略图读取真实大小，部分原文件路径仍使用数据库大小。采用上游会替换当前额外修复。 |
| E 实时连接 | 笔记引用计数、用户统计订阅、批量通知和清理 | 串行消息队列及关闭状态检查。直接替换 Connection 会失去本地用户统计订阅实现。 |
| F 注册邀请 | 当前邀请码占用/释放流程 | 增加 pendingUser 过期判断、解除过期关联和重新占用。可独立按上游流程处理。 |
| G 推送与退出 | 当前登录状态、偏好清理，以及旧退订参数 | 新 auth/publickey 退订契约和编码函数。前后端需成组更新；整文件替换 signout 还会覆盖本地退出处理。 |
| H Windows 检查脚本 | 使用 Node 显式启动本地 pnpm，已在当前环境验证 | 使用上游 execa/pnpm 调用方式。选择上游需重新验证 Windows 启动。 |
| I 版本、日志和翻译 | 2026.9.2-alpha.0 及本地中文措辞 | 2026.10.0、上游日志和 Crowdin 措辞；中文“限制互动”与“屏蔽”存在冲突。 |
| J 已等价的修复 | MFM 重渲染修复、清理游标代码/测试，部分中文注释 | 对应实现已包含，差异主要为注释或重复引入；可保留当前而不重复添加。 |

此外，无文本冲突文件也保留了大量定制内容。例如直接整文件覆盖 ChatService 会删除红包、自动回复和免打扰处理；覆盖 ApiCallService 会删除二进制下载响应头处理。因此不会把整个上游目录复制覆盖当前项目。

## 已确认的合并方案

1. A：保留个人页侧栏、嵌套路由和备注弹窗；合入资料及时间线刷新。两页样式与合并前完全一致。
2. B、E：保留点赞、收藏、浏览量、回复占位符和实时统计；合入访问控制、串行消息处理及连接关闭检查。
3. C、D：保留已有的多反应键累加及真实文件大小修复，补齐上游反应权限、文件访问键和响应头修复。
4. F、G：合入邀请码过期回收、推送退订鉴权和统一订阅键编码；保留当前退出登录处理。
5. H、I、J：保留已验证的 Windows 检查命令和等价修复；同步版本、依赖、日志和上游翻译。

87 个上游变更路径均已处理；没有遗留待选择项或冲突标记。

## 完整差异与可恢复方案

- 完整上游补丁：`.git/codex-backups/upstream-2026.10.0-ed9654bde0/comparison/upstream.patch`。
- 合并前文件：`.git/codex-backups/upstream-2026.10.0-ed9654bde0/original/` 和 `workspace-backup/`。
- 上游功能合并快照：`.git/codex-backups/upstream-2026.10.0-ed9654bde0/proposal/`；复制反馈和换行设置以当前源码中的最新要求为准。
- 当前最终版本已重新通过生产前端构建、后端构建、API SDK 生成及 97 项定向测试（前端单元 54、代码块浏览器 5、后端 38）。
- 当前代码块已删除换行开关、固定不折行，复制成功后 3 秒恢复，相关 5 项浏览器测试通过。

## 检查范围与限制

- PASS：锁文件依赖安装；前后端构建；API SDK 生成；97 项定向测试。
- PASS：最终变更文件 lint、SPDX 检查。
- SKIPPED：依赖 PostgreSQL/Redis 的数据库集成测试，测试服务未启动，Docker 命令不可用。
- BASELINE：额外的频道编辑器浏览器套件被既有 local-storage mock 缺少 getItem 阻塞，未计入通过数量；该页面生产构建已通过。
- FAIL（来源已核对）：Locale safety 脚本标记 ko-GS.yml 和 zh-CN.yml；包含用户确认同步的上游 Crowdin 译文，zh-CN.yml 还保留合并前已有改动。

## 87 个文件逐项状态

| 文件 | 状态 |
| --- | --- |
| `.config/docker_example.yml` | 已同步上游更新 |
| `.config/example.yml` | 已同步上游更新 |
| `CHANGELOG.md` | 已按确认原则解决 |
| `locales/en-US.yml` | 已合并功能，保留本地改动 |
| `locales/id-ID.yml` | 已包含，无需重复更新 |
| `locales/it-IT.yml` | 已包含，无需重复更新 |
| `locales/ko-GS.yml` | 已同步上游更新 |
| `locales/ru-RU.yml` | 已包含，无需重复更新 |
| `locales/uk-UA.yml` | 已包含，无需重复更新 |
| `locales/zh-CN.yml` | 已按确认原则解决 |
| `package.json` | 已按确认原则解决 |
| `packages/backend/package.json` | 已合并功能，保留本地改动 |
| `packages/backend/src/core/ChatService.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/core/ClipService.ts` | 已包含，无需重复更新 |
| `packages/backend/src/core/DownloadService.ts` | 已同步上游更新 |
| `packages/backend/src/core/FanoutTimelineEndpointService.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/core/PollService.ts` | 已包含，无需重复更新 |
| `packages/backend/src/core/PushNotificationService.ts` | 已同步上游更新 |
| `packages/backend/src/core/QueryService.ts` | 已按确认原则解决 |
| `packages/backend/src/core/QueueService.ts` | 已同步上游更新 |
| `packages/backend/src/core/ReactionService.ts` | 已按确认原则解决 |
| `packages/backend/src/core/ReactionsBufferingService.ts` | 已按确认原则解决 |
| `packages/backend/src/core/RelayService.ts` | 已同步上游更新 |
| `packages/backend/src/core/SearchService.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/core/activitypub/ApInboxService.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/core/activitypub/ApRequestService.ts` | 已包含，无需重复更新 |
| `packages/backend/src/core/chart/core.ts` | 已包含，无需重复更新 |
| `packages/backend/src/core/entities/NoteEntityService.ts` | 已按确认原则解决 |
| `packages/backend/src/misc/sql-string-escape.ts` | 已包含，无需重复更新 |
| `packages/backend/src/postgres.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/queue/processors/CleanRemoteNotesProcessorService.ts` | 已按确认原则解决 |
| `packages/backend/src/server/ActivityPubServerService.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/server/api/ApiCallService.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/server/api/SigninWithPasskeyApiService.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/SignupApiService.ts` | 已按确认原则解决 |
| `packages/backend/src/server/api/endpoints/channels/timeline.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/chat/messages/react.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/chat/messages/unreact.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/federation/followers.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/federation/following.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/federation/update-remote-user.ts` | 已包含，无需重复更新 |
| `packages/backend/src/server/api/endpoints/get-avatar-decorations.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/i/update.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/server/api/endpoints/notes.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/notes/conversation.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/notes/favorites/create.ts` | 已按确认原则解决 |
| `packages/backend/src/server/api/endpoints/notes/featured.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/notes/global-timeline.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/server/api/endpoints/notes/polls/vote.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/server/api/endpoints/notes/search-by-tag.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/notes/show-partial-bulk.ts` | 已按确认原则解决 |
| `packages/backend/src/server/api/endpoints/notes/translate.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/sw/register.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/sw/unregister.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/endpoints/users/notes.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/server/api/endpoints/users/show.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/stream/Connection.ts` | 已按确认原则解决 |
| `packages/backend/src/server/api/stream/NoteStreamingHidingService.ts` | 已同步上游更新 |
| `packages/backend/src/server/api/stream/channels/role-timeline.ts` | 已同步上游更新 |
| `packages/backend/src/server/file/FileServerDriveHandler.ts` | 已按确认原则解决 |
| `packages/backend/src/server/file/FileServerFileResolver.ts` | 已合并功能，保留本地改动 |
| `packages/backend/src/server/file/FileServerUtils.ts` | 已包含，无需重复更新 |
| `packages/backend/src/server/oauth/OAuth2ProviderService.ts` | 已同步上游更新 |
| `packages/backend/src/server/web/ClientServerService.ts` | 已同步上游更新 |
| `packages/backend/src/server/web/FeedService.ts` | 已同步上游更新 |
| `packages/backend/test-server/entry.ts` | 已包含，无需重复更新 |
| `packages/backend/test/e2e/clips.ts` | 已包含，无需重复更新 |
| `packages/backend/test/unit/ap-request.ts` | 已包含，无需重复更新 |
| `packages/backend/test/unit/queue/processors/CleanRemoteNotesProcessorService.ts` | 已按确认原则解决 |
| `packages/backend/test/unit/server/FileServerService.ts` | 已按确认原则解决 |
| `packages/backend/vitest.config.e2e.ts` | 已包含，无需重复更新 |
| `packages/frontend/src/components/MkModal.vue` | 已合并功能，保留本地改动 |
| `packages/frontend/src/components/MkPushNotificationAllowButton.vue` | 已同步上游更新 |
| `packages/frontend/src/components/global/MkCustomEmoji.vue` | 已合并功能，保留本地改动 |
| `packages/frontend/src/components/global/MkMfm.ts` | 已按确认原则解决 |
| `packages/frontend/src/pages/user/home.vue` | 已按确认原则解决 |
| `packages/frontend/src/pages/user/index.timeline.vue` | 已合并功能，保留本地改动 |
| `packages/frontend/src/pages/user/index.vue` | 已按确认原则解决 |
| `packages/frontend/src/signout.ts` | 已按确认原则解决 |
| `packages/frontend/src/utility/encode-push-subscription-key.ts` | 已同步上游更新 |
| `packages/frontend/src/utility/get-user-menu.ts` | 已合并功能，保留本地改动 |
| `packages/misskey-js/package.json` | 已按确认原则解决 |
| `packages/misskey-js/src/autogen/apiClientJSDoc.ts` | 已合并功能，保留本地改动 |
| `packages/misskey-js/src/autogen/types.ts` | 已合并功能，保留本地改动 |
| `pnpm-lock.yaml` | 已合并功能，保留本地改动 |
| `pnpm-workspace.yaml` | 已按确认原则解决 |
| `scripts/check-shipping.mjs` | 已按确认原则解决 |

## 43 个上游提交

```text
499e1d7d78 fix(frontend): MFMでカスタム絵文字の再描画が走る問題を修正 (#17953)
1510c443cd fix(backend): リモートノート削除のカーソルを保持するように (#17957)
38416e5401 fix: Windowsでshipping lintを実行できない問題を修正 (#17956)
559d7453e1 Bump version to 2026.9.1-alpha.0
1dca99645e Update CHANGELOG.md
7c149fa227 New Crowdin updates (#17951)
b16acdcd1c Update dependency nodemailer to v9.1.1 [SECURITY] (#17932)
ef25ce0cd1 Merge commit from fork
c4406f41eb Merge commit from fork
ba7f23ab03 Merge commit from fork
6fe2252520 Merge commit from fork
1967f80d24 Merge commit from fork
ab6d188f6c Merge commit from fork
b53c6182c8 Bump version to 2026.9.1-beta.0
9129a3eb98 Update CHANGELOG.md [ci skip]
b92a94eb93 fix(backend): harden db operations (#17963)
7f05994f00 Release: 2026.9.1
be56414e88 [skip ci] Update CHANGELOG.md (prepend template)
feaa29fa06 fix: review fixes for 2026.9.1 (#17964)
e86a3373e4 fix(backend/test): のカバレッジが正しく記録されない問題を修正 (#17981)
7c9c38c04a fix: include query string in HTTP Signature (request-target) (#17941)
4682d44cae fix(backend): クリップから同じノートを繰り返し削除すると clippedCount が負数になる問題の修正 (#17974)
fb16c7f385 fix(frontend): MkModal初期化時に要素が存在しない場合エラーが発生しうる問題を修正 (#17968)
c146fd8d10 fix(frontend): カスタム絵文字でリアクションコールバックの inject 警告を解消 (#17967)
599e64f2a5 Bump version to 2026.9.2-alpha.0
721948c7e7 New Crowdin updates (#17970)
11692e5ebf fix(frontend): ユーザーの「概要」ページで引っ張って更新しても何も更新されない問題を修正 (#17965)
4ef6cbe2af Merge commit from fork
367daf868a Merge commit from fork
4d1f2aa2c6 Merge commit from fork
ec5fc00005 Update CHANGELOG.md [ci skip]
a10fdf706c Merge commit from fork
3bea204ac5 fix: review fixes for v2026.10.0 (#17987)
a6a141e51f fix(backend): オブジェクトストレージ不使用時の画像周りの挙動の修正 (#17988)
9c5a38ab2c New Crowdin updates (#17986)
1e7ae26d93 Bump version to 2026.10.0-alpha.0
babe6a7d01 Update CHANGELOG.md
5ada833a84 Update CHANGELOG.md [ci skip]
097d667f2d Update dependency fastify to v5.12.5 [SECURITY] (#17990)
03bc96654c fix: review fixes for v2026.10.0 (2) (#17991)
b6019638f2 Merge commit from fork
de89118a22 Release: 2026.10.0
ed9654bde0 [skip ci] Update CHANGELOG.md (prepend template)
```
