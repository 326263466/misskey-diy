# 前端测试（Vitest / Playwright）

代理在交接和验证记录中统一使用简体中文。命令、路径、代码和已有测试名称保持原样。

Misskey frontend のテスト構成。

遵循 [AGENTS.md](../../../../../AGENTS.md#测试与执行效率)：先看已有覆盖，按风险补最小用例，优先复用现有文件。文案和纯样式默认不新增测试；界面验证优先利用现有页面或 Storybook，不为一次性截图、固定像素和类名断言新建测试。相关检查通过后停止，不自动追加浏览器或全量测试。

## Vitest (unit)

```bash
# 替换实际文件，可一次传入多个路径；省略路径才会跑整套
pnpm --filter frontend test test/unit/<file>.test.ts
```

覆盖率仅在明确需要时使用 `test-and-coverage`，不作为每次变更的默认步骤。

### 配置

- 主要位置：`packages/frontend/test/unit/*.test.ts`（如 `i18n.test.ts`、`theme.test.ts`、`is-birthday.test.ts`）
- ビルドツール周りなど対象コードと隣接させた方が分かりやすいテストは、コードと同じディレクトリに `*.test.ts` として置く (例: [packages/frontend/lib/rollup-plugin-unwind-css-module-class-name.test.ts](../../../../../packages/frontend/lib/rollup-plugin-unwind-css-module-class-name.test.ts))
- 组件行为也可复用该目录下的 Vue Testing Library 测试；不要为组件另建 `__tests__/` 目录。

## Vitest browser（按需）

只有 happy-dom 无法模拟、且出错会让功能不可用的浏览器行为才选择，例如焦点和键盘、滚动定位、全屏、媒体播放、弹层避开视口。不连接后端。测试位于 `packages/frontend/test/browser/`，配置为 `vitest.config.browser.ts`。

间距、宽度、居中、圆角、主题配色等纯外观问题不写 browser test，用现有页面、Storybook 或临时截图手动确认，截图不提交。

```bash
pnpm --filter frontend test:browser test/browser/<file>.test.ts
```

不要为了界面微调扩展多宽度、主题和动画开关的笛卡尔组合；选能区分风险的代表场景。临时诊断和截图放在测试发现范围之外，交付前清理本任务产物。

## Playwright E2E

仅在涉及真实前后端流程且较轻验证不足时使用，不是新增功能的固定步骤。测试服务已准备好时，定向运行 `pnpm --filter frontend test:e2e test/e2e/<file>.spec.ts`；下面是需要搭建完整环境时的步骤。

Playwright は **起動済みのテストサーバー** に対して走るため、unit より前提が多い。[.github/workflows/test-frontend.yml](../../../../../.github/workflows/test-frontend.yml) の `e2e` ジョブと同じ手順をローカルで踏む:

```bash
# 1. テスト用 DB / Redis を起動 (テスト用ポート。開発用の compose.local-db.yml ではない)
docker compose -f packages/backend/test/compose.yml up -d

# 2. テスト設定を配置 (未作成なら。例示なので、cpコマンドは環境にあったコマンドに適宜読み替えること)
cp .github/misskey/test.yml .config/test.yml

# 3. 全体ビルド
pnpm build

# 4. テストサーバー起動 + Playwright 実行 (いずれもルートから)
pnpm e2e                # 内部で pnpm start:test を起動し http://localhost:61812 を待って Playwright を実行
```

- 設定: ルート [packages/frontend/playwright.config.ts](../../../../../packages/frontend/playwright.config.ts) で、`packages/frontend/test/e2e/` 配下の `*.spec.ts` を対象にする
- テスト本体は [packages/frontend/test/e2e/](../../../../../packages/frontend/test/e2e/) 配下に配置する。

主要 UI 流程（登录、发帖、云盘等）缺少跨层覆盖时考虑 Playwright；已有覆盖充分则复用，不要求每项新功能新增 E2E 文件。

## Storybook (視覚確認 + Chromatic 視覚回帰)

詳細は → [storybook.md](storybook.md)。

```bash
pnpm --filter frontend storybook-dev      # http://localhost:6006
pnpm --filter frontend build-storybook    # 静的ビルド
```

各コンポーネント横に `*.stories.impl.ts` を併設する慣習 (例: `MkButton.stories.impl.ts`)。Chromatic (`pnpm --filter frontend chromatic`) で視覚回帰チェック。

## ローカル DB / Redis

frontend のテスト種別で DB / Redis の要否が違う:

- **Vitest (unit)** — DB 不要。ロジック / コンポーネント単体のテストで backend に繋がない (CI の `vitest` ジョブにも `services:` は無い)
- **Playwright (E2E)** — テストサーバー (`pnpm start:test`) 経由で backend に繋ぐため DB / Redis が必要。**テスト用ポートの [packages/backend/test/compose.yml](../../../../../packages/backend/test/compose.yml)** を使う (上記 Playwright E2E の手順を参照)

開発用の `compose.local-db.yml` (db `5432` / redis `6379`) は **テストには使わない**。テスト用の `packages/backend/test/compose.yml` (`54312` / `56312`) とはポートが異なり、混同すると接続できない。
