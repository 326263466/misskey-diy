# 掘金风格布局改造设计文档

目标：把本项目（Misskey fork）的默认桌面布局改造为掘金（juejin.cn）风格 —— **顶部固定 header 导航栏 + 下方三列布局**，但**配色 / 圆角 / 间距全部沿用当前项目的主题体系**（`--MI_THEME-*` / `--MI-*`），不引入掘金的硬编码颜色。

本文档的数据来自两侧的实测：掘金 `https://juejin.cn/pins` 页面的 `getComputedStyle` / `getBoundingClientRect` 实测值，以及本仓库 `packages/frontend/src/` 的源码走读。

---

## 1. 掘金布局实测结果

在 1585px 视口下对 `https://juejin.cn/pins` 实测（数值为 CSS px）。

### 1.1 顶部 header

| 属性 | 实测值 |
| --- | --- |
| 元素 | `<header class="main-header">` |
| `position` | `sticky`，`top: 0` |
| `height` | `60px` |
| `z-index` | `250` |
| `background` | `rgb(255,255,255)` |
| `box-shadow` | `rgb(242,243,245) 0 2px 8px 0` |
| `width` | 视口满宽（`1584.8px`） |
| 内层 `.container` | `display:flex; align-items:center; max-width:1440px; margin:0 auto; height:60px` |
| logo | `width:107px; margin:0 12px 0 24px` |
| `nav.main-nav` | 紧随 logo，占据剩余宽度，右侧为搜索框 + 创作者中心 + 登录 |

要点：header 满宽铺底，内容被 `max-width:1440px` 的容器居中；**比下方主内容容器（1200px）更宽**，这是掘金的一个明确特征。

### 1.2 三列主体

| 属性 | 实测值 |
| --- | --- |
| 外层 | `main.container.main-container`，`max-width:1200px`，`margin:0 auto`，`position:relative` |
| 内层 | `main.main`，`display:flex`，`margin:20px 0 72px`，`width:1200px` |

三个 flex 子项：

| 列 | 类名 | 宽度 | flex | margin-right |
| --- | --- | --- | --- | --- |
| 左 | `.dock.shadow` | `180px` | `0 1 auto` | `20px` |
| 中 | `.stream` | `720px` | `0 0 auto` | `20px` |
| 右 | `.sidebar` | `260px` | `1 1 0%` | `0` |

宽度校验：`180 + 20 + 720 + 20 + 260 = 1200` ✓

### 1.3 各列的滚动行为（关键）

掘金**滚动的是 document 本身**，因此：

- **左列**：外层 `.dock` 高度为 `0`（只占位），真正的 `nav.dock-nav` 是 `position: fixed; top: 80px; width: 180px; z-index: 99`，背景白、`border-radius: 4px`、`padding: 8px`。所以左侧导航**随页面滚动而不动**。
  - `top: 80px` = header `60px` + `main` 的 `margin-top: 20px`。
- **中列**：`.stream` 高度 `5164px`，即真实内容高度，跟随 document 滚动。
- **右列**：`.sidebar` 内部依次是 `.userbox`（白卡片，`padding:24px 20px`）、`.list_box`（`margin-top:16px`）、`.fixbox`（滚动到位后 sticky 吸顶）。

### 1.4 配色与圆角

| 项 | 掘金值 |
| --- | --- |
| `body` 背景 | `rgb(242,243,245)`（浅灰） |
| 卡片背景 | `rgb(255,255,255)` |
| 卡片圆角 | `4px` |
| 列间距 | `20px` |

---

## 2. 本项目现状分析

### 2.1 UI shell 的选择机制

`packages/frontend/src/boot/main-boot.ts:35-59` 用 `switch (uiStyle)` 决定根组件：

| `uiStyle` | 根组件 |
| --- | --- |
| `zen` | `@/ui/zen.vue` |
| `deck` | `@/ui/deck.vue` |
| `visitor` | `@/ui/visitor.vue`（未登录强制） |
| 其它 / `default` | `@/ui/universal.vue` |

`uiStyle` 来自 `localStorage` 的 `ui` 键（`packages/frontend-shared/js/config.ts:20`），也可用 `?ui=` 查询参数临时覆盖。切换入口在 `packages/frontend/src/navbar.ts:148-168` 的 `ui` 菜单项（目前只有 default / deck 两项）。

### 2.2 现有默认布局 `universal.vue`

```
.root                     height:100dvh; overflow:clip; contain:strict; flex-column
├─ XTitlebar              可选
└─ .nonTitlebarArea       display:flex
   ├─ XSidebar            navbar.vue —— 竖向侧边栏，250px / icon-only 80px
   ├─ .contents           flex-column, flex:1
   │  ├─ 提示条区          ReloadSuggestion / PreferenceRestore / Announcements / StatusBars
   │  ├─ RouterView       .content flex:1
   │  └─ XMobileFooterMenu
   └─ .widgets            350px，右侧挂件栏
```

即：**当前已经是「左侧竖向导航 + 中间内容 + 右侧挂件」的三列**，但导航是**竖向左置**而非掘金的**顶部横向 header**。

### 2.3 滚动架构（改造中最关键的约束）

这是本项目与掘金最本质的差异：

- `.root` 是 `height: 100dvh; overflow: clip; contain: strict`，**整个 app shell 永不滚动**。
- 真正的滚动容器是每个页面自己：`RouterView.vue:7` 的根节点带 `_pageContainer`，其样式（`style.scss:205-210`）为 `container-type:size; contain:strict; overflow:auto`。
- 页面内部 `PageWithHeader.vue` 再套一层 `_pageScrollable`（`height:100%; overflow-y:scroll`）。
- 页面头部吸顶靠 `MkStickyContainer.vue` 通过 `DI.currentStickyTop` / `DI.currentStickyBottom` 逐层累加，产出 `--MI-stickyTop` / `--MI-stickyBottom`。
- 触底加载依赖 `@@/js/scroll.js` 的 `getScrollContainer()`，它**向上查找第一个 `overflow-y: scroll|auto` 的祖先**。
- 滚动位置记忆依赖 `useScrollPositionKeeper(rootEl)`。

**结论：不能把 shell 改成「document 滚动 + sticky header」的掘金原生做法。** 那会同时破坏 `_pageContainer` 的 `contain: strict`、`MkStickyContainer` 的吸顶计算、`getScrollContainer()` 的触底加载，以及全部约 200 个页面的滚动位置记忆。

**采用的等效方案**：shell 用 flex 竖排，header 作为 `flex-shrink: 0` 的兄弟节点置顶。由于 shell 本身 `overflow: clip` 永不滚动，**header 天然就是「固定不变」的**，无需 `position: fixed/sticky`，且不会与页面内滚动容器冲突。三列区域为 `flex: 1; min-height: 0` 的 flex 行，中列托管 `RouterView`，保留其自有滚动容器。

这样得到的视觉效果与掘金一致（掘金左列本来就是 `position: fixed` 不动的），但零成本兼容现有页面体系。

### 2.4 主题变量（改造要沿用的）

| 掘金硬编码 | 本项目对应变量 |
| --- | --- |
| `#f2f3f5` 页面底色 | `var(--MI_THEME-bg)` |
| `#fff` 卡片 | `var(--MI_THEME-panel)` |
| `#fff` header | `var(--MI_THEME-navBg)` |
| 分割线 | `var(--MI_THEME-divider)` |
| 高亮 / 选中态 | `var(--MI_THEME-accent)`、`var(--MI_THEME-navActive)` |
| `4px` 圆角 | `var(--MI-radius)`（12px，沿用项目值） |
| `20px` 列间距 | `var(--MI-margin)`（16px，沿用项目值） |

`.claude/skills/working-on-frontend/references/knowledge/scss-modules.md` 明确要求禁止硬编码颜色，因此掘金的白 / 灰一律映射为上表变量。

---

## 3. 改造设计

### 3.1 落地方式：改造 `universal.vue` 的桌面分支，移动端原样保留

需求是「把现在的项目布局改成掘金风格」，因此**不新增可选 UI 风格**，而是直接改造默认 shell `universal.vue`：

- **桌面**（`isMobile === false`）→ 掘金风格：顶部固定 header + 三列。
- **移动端**（`deviceKind === 'smartphone'` 或 `innerWidth <= 500`）→ **模板结构与样式完全沿用改造前的实现**，掘金的 header / dock 组件在该分支下根本不渲染。

`deck` / `zen` / `visitor` 三种 shell 不受影响。判定 `isMobile` 的表达式（`MOBILE_THRESHOLD = 500`）与改造前逐字一致，未做任何调整。

### 3.2 目标 DOM 结构

```
.root                        height:100dvh; overflow:clip; contain:strict; flex-column
├─ XTitlebar                 可选，沿用
│
├─ [移动端分支] v-if="isMobile"        ← 改造前的结构，原样保留
│  └─ .nonTitlebarArea → .contents
│     ├─ 提示条区 / RouterView / XMobileFooterMenu
│
└─ [桌面分支] v-else                   ← 掘金风格
   ├─ XJuejinHeader          flex-shrink:0; height:60px   顶部固定导航栏
   │  └─ .inner              max-width:1440px; margin:0 auto; display:flex; align-items:center
   │     ├─ .logo            实例图标 + 实例名
   │     ├─ nav              时间线 / 发现 / 频道 / 公告（横向）
   │     └─ .right           搜索 / 通知 / 更多 / 设置 / 发帖 / 头像
   ├─ .notices               ReloadSuggestion / PreferenceRestore / ThemePreviewing / Announcements / StatusBars
   └─ .body → .columns       flex:1; min-height:0; display:flex; max-width:1200px; margin:0 auto
      ├─ XJuejinDock         width:180px; flex-shrink:0   左列，纵向导航卡片
      ├─ .stream             flex:1; min-width:0          中列，托管 RouterView（页面自带滚动）
      └─ .sidebar            width:260px; flex-shrink:0   右列，挂件（自带滚动）
```

对照掘金：`1440px` header 容器 + `1200px` 主体容器 + `180 / * / 260` 三列，全部与 §1 实测一致；仅列间距用 `var(--MI-margin)` 替代掘金的 `20px`，中列改为 `flex:1` 自适应（掘金是固定 720px），以便在 1200px 以下平滑收缩。

管理页等 `pageMetadata.needWideArea` 的页面（`/admin/job-queue` 等）取消 1200px 上限并隐藏左右两列，避免宽表格被压缩。

### 3.3 响应式断点

| 视口宽度 | 行为 |
| --- | --- |
| `>= 1180px` | 三列完整显示 |
| `900px – 1180px` | 隐藏右列 sidebar，左列 + 中列两列 |
| `500px – 900px` | 隐藏左列 dock，仅中列；header 收起文字（logo / 搜索 / 发帖按钮按 1200/1100/1000px 逐级收窄） |
| `<= 500px` / smartphone | **移动端分支，布局与改造前完全一致**，底部 `XMobileFooterMenu` |

### 3.4 各列内容

**左列 dock**（对应掘金 `nav.dock-nav`）：一张 `_panel` 卡片，纵向列出 `navbarItemDef` 中的导航项（复用现有 `prefer.r.menu`），当前路由高亮 `--MI_THEME-accent`。因 shell 不滚动，它天然固定，无需 `position: fixed`（掘金则必须靠 `position: fixed; top: 80px` 才能不动）。

**中列 stream**：`RouterView` / `StackingRouterView`，`min-width: 0` 防止 flex 溢出。页面自身的 `_pageContainer` 继续作为滚动容器，`MkStickyContainer` 的吸顶、触底加载、滚动记忆全部照常工作。

**右列 sidebar**（对应掘金 `.sidebar`）：复用现有 `_common_/widgets.vue`，`overflow: auto` 自行滚动。

### 3.5 header 内容

复用现有能力，不新造逻辑：

- 实例菜单 → `openInstanceMenu()`（`_common_/common.js`）
- 导航项 → `navbarItemDef`（`@/navbar.js`）
- 账号菜单 → `getAccountMenu()`（`@/accounts.js`）
- 发帖 → `os.post()`
- 更多 → `MkLaunchPad.vue` popup

i18n 全部复用 `locales/ja-JP.yml` 已有键（`timeline` / `explore` / `announcements` / `search` / `settings` / `note` / `more` / `controlPanel` / `account` / `widgets` / `notifications` 等），仅在确有新文案时才追加，且**只改 `ja-JP.yml`**（其余 locale 由 Crowdin 分发）。

---

## 4. 实施步骤与落地结果

| # | 步骤 | 文件 | 状态 |
| --- | --- | --- | --- |
| 1 | 新建顶部固定 header | `packages/frontend/src/ui/_common_/juejin-header.vue` | 已完成（新增） |
| 2 | 新建左列纵向导航卡片 | `packages/frontend/src/ui/_common_/juejin-dock.vue` | 已完成（新增） |
| 3 | 改造默认 shell 为「header + 三列」，移动端分支原样保留 | `packages/frontend/src/ui/universal.vue` | 已完成（修改） |
| 4 | i18n | `locales/ja-JP.yml` | **无需改动**：所需文案（`timeline` / `explore` / `announcements` / `search` / `settings` / `note` / `more` / `controlPanel` / `account` / `instance` / `notifications`）均为已有键 |
| 5 | 编写本设计文档 | `docs/juejin-layout-design.md` | 已完成 |

未新增 UI 风格，因此 `boot/main-boot.ts` 与 `navbar.ts` 均无需改动（§3.1）。

### 4.1 验证结果

静态检查：

| 项 | 命令 | 结果 |
| --- | --- | --- |
| SPDX 头 | `node scripts/check-spdx.mjs` | `SPDX: OK`（2456 文件通过） |
| 类型检查 | `pnpm --filter frontend typecheck`（`vue-tsc --noEmit`） | 通过，无报错 |
| ESLint | `eslint --quiet` 针对 3 个改动文件 | 通过，无输出 |
| locale 安全性 | `git status` | 未触碰任何 locale YAML（含 `ja-JP.yml`），无 Crowdin 风险 |

浏览器实测（对照 §1 掘金实测值）：

| 视口 | header | 左列 dock | 中列 stream | 右列 sidebar | 横向溢出 |
| --- | --- | --- | --- | --- | --- |
| 1600px | `1600×60`，内层 `1440px` 居中 | `180px` | `696px` | `260px` | 无 |
| 1180px | 显示 | `180px` | `952px` | 隐藏 | 无 |
| 1100px | 显示 | `180px` | `872px` | 隐藏 | 无 |
| 950px | 显示 | `180px` | `722px` | 隐藏 | 无 |
| 860px | 显示 | 隐藏 | `828px` | 隐藏 | 无 |
| 520px | 显示 | 隐藏 | `488px` | 隐藏 | 无 |
| 420px | **不渲染** | **不渲染** | **不渲染** | **不渲染** | 无 |

- 1600px 下三列容器实测 `x=200, w=1200`，即 1200px 居中，与掘金 §1.2 一致；`180 + 696 + 260 + 2×16(gap) + 32(padding) = 1200` ✓
- 420px 下掘金组件全部不渲染，`.nonTitlebarArea` / `.contents` / `XMobileFooterMenu`（`67px`）照常呈现 → **移动端未受影响**
- 滚动实测：中列滚动 `94px` 后，header 仍在 `top=0`（高度 `60px`），左列 dock 仍在 `top=76`，右列 `top=76`，`document.scrollY` 恒为 `0` → 顶部导航栏「固定不变」成立，且未改动 document 滚动模型
- 滚动容器实测位于中列内部（`_pageScrollable` / `_pageContainer`），`MkStickyContainer` 正常产出 `data-sticky-container-header-height`（实测 `51`）→ 页面吸顶、触底加载、滚动记忆未被破坏（§2.3）
- 宽屏页面 `/admin/job-queue`（`needWideArea`）实测：header 保留，三列容器放开至 `1600px`，左右列隐藏

### 4.2 已知的既有问题（与本次改造无关）

开发环境下快速连续刷新时，偶发 `InvalidStateError: Transition was aborted because of invalid state` 引导页错误覆盖层。该错误源自 `packages/frontend/src/theme.ts:115` 的 `document.startViewTransition`，代码注释已标注为上游已知问题（misskey-dev/misskey#16562，「viewTransiton エラーは try~catch 貫通してそう」）。

已通过 `git stash` 回退到改造前的原始代码复现同一错误，且该错误同样出现在完全不加载本次新增组件的 `zen` UI 上，因此确认为既有问题，非本次改造引入。本次新增的两个组件不包含任何 view transition 代码。

---

## 5. 风险与规避

| 风险 | 规避 |
| --- | --- |
| 破坏页面滚动 / 触底加载 / 吸顶 | 不改 document 滚动模型，shell 保持 `overflow: clip`，中列继续托管页面自有滚动容器（§2.3） |
| 硬编码掘金配色 | 全部映射到 `--MI_THEME-*` / `--MI-*`（§2.4） |
| flex 子项溢出 | 中列 `min-width: 0`，长文本 / 媒体不撑破布局 |
| 改动影响移动端 | 移动端走独立的 `v-if="isMobile"` 分支，模板与样式逐字沿用改造前实现；掘金组件在该分支不渲染，已在 420px 实测确认（§4.1） |
| 宽屏页面被压缩 | `needWideArea` 的页面放开 1200px 上限并隐藏左右列 |
| 误改 Crowdin locale | 本次未触碰任何 locale YAML（所需文案均为已有键） |
| 想回到改造前布局 | `deck` / `zen` 两种 shell 未改动，可经「UI 切换」菜单临时切换；完整回退只需还原 `universal.vue` 并删除两个新增组件 |
