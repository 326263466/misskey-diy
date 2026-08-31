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

### 1.5 页面宽度的响应式行为（第二轮实测）

为了做到「页面宽度也要和掘金一样」，在同一页面上把视口从 1000px 拉到 1920px 逐档实测：

| 视口 | header 内层 | 主体容器 | 左列 | 中列 | 右列 |
| --- | --- | --- | --- | --- | --- |
| 1920px | `1440px` 居中 | `1200px` 居中 | `180px` | `720px` | `260px` |
| 1600px | `1440px` 居中 | `1200px` 居中 | `180px` | `720px` | `260px` |
| 1440px | `1425px`（满宽） | `1200px` 居中 | `180px` | `720px` | `260px` |
| 1280px | `1265px`（满宽） | `1200px` 居中 | `180px` | `720px` | `260px` |
| 1215px | 满宽 | `1200px` | `180px` | `720px` | `260px` |
| 1200px 及以下 | 满宽 | 跟随视口 | **0（塌陷）** | 占满 | **0（塌陷）** |

关键结论（与第一轮只测 1585px 相比新增的认识）：

1. **主体固定 `1200px`，不随视口放大**，只是左右外边距变大（`margin-left` 从 `32.4px` → `352.4px`）。三列宽度 `180 / 720 / 260` 在所有 ≥1215px 的视口下**恒定不变**，中列不是弹性的。
2. **header 内层是 `max-width: 1440px`**，比主体宽 240px；视口 <1440px 时它退化为满宽，所以 1280px 时 header 内容比主体更靠边。
3. **三列的塌陷点在 1200px 与 1215px 之间**：1215px 时三列仍是完整的 `180/720/260`，1201px 时开始被压缩（实测 `179 / 720 / 247`）。掘金没有做「先收右列再收左列」的分级，而是**两侧一起塌陷**。
4. 主体容器**自身没有左右 padding**，`180 + 20 + 720 + 20 + 260 = 1200` 精确等于容器宽度。

第一轮实测只在 1585px 单点取值，据此写成的「中列 `flex:1` 自适应 + 右列先塌陷（1180px）+ 左列后塌陷（900px）」是**与掘金不符的推断**，§3 已按本节修正。

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

对照掘金（§1.2 / §1.2.1）：header 内侧 `1440px` + 主体 `1200px` + `180 / 720 / 260` 三列 + `20px` 列间距 + `20px` 顶部间距，**全部为掘金实测原值**。

与掘金的两处有意差异：

| 项 | 掘金 | 本项目 | 原因 |
| --- | --- | --- | --- |
| 中列宽度 | 固定 `720px` | `flex: 1; min-width: 0` | ≥1215px 时结果同为 `720px`（1200−180−260−40），完全一致；折叠后中列独占时能自然铺满，无需另写规则 |
| 折叠后左右边距 | document 滚动，无需处理 | `padding: 0 var(--MI-margin)` | shell 不滚动，窄屏下需要留边避免卡片贴边 |

管理页等 `pageMetadata.needWideArea` 的页面取消 1200px 上限并隐藏左右两列，避免宽表格被压缩。声明该标记的页面见 §6。

### 3.3 响应式断点（已按 §7 修订为两级塌陷）

初版照搬掘金的**单一断点**（1200px 放不下三列就左右一起收），实际使用中发现塌陷得太早：掘金的 1200px 是「三列都保持标称宽度」的下限，而本项目中列本来就是 `flex: 1` 可压缩的（§3.2），用同一个数值等于把可压缩的余量白白丢掉。详见 §7。

现行为**两级塌陷**：先收右列（挂件，信息密度最低），再收左列（导航）。

| 视口宽度 | 行为 |
| --- | --- |
| `>= 1232px` | 三列均为标称宽度，容器 `1200px` 居中（`180 / 720 / 260`），与掘金一致 |
| `1112px – 1231px` | 三列全在，中列从 `720px` 起被压缩，最窄 `600px` |
| `752px – 1111px` | 右列隐藏；容器收敛到 `180 + 20 + 720` 的自然宽度，中列回到 `720px` 后再压缩，最窄 `520px` |
| `501px – 751px` | 左列也隐藏，仅中列；header nav 改为横向滚动以保证末尾项可达 |
| `<= 500px` / smartphone | **移动端分支，布局与改造前完全一致**，底部 `XMobileFooterMenu` |

两个阈值**由列宽算出**而非直写，改任一列宽都会自动跟随：

```scss
$sidebar-collapse-threshold: $body-side-margin * 2 + $dock-width + $column-gap
	+ $stream-fit-min-3col + $column-gap + $sidebar-width - 1px;   // = 1111px
$dock-collapse-threshold: $body-side-margin * 2 + $dock-width + $column-gap
	+ $stream-fit-min-2col - 1px;                                  // = 751px
```

即「三列 + 左右边距 + 中列可接受的最小宽度」同时放不下时，才收掉一列。`$stream-fit-min-3col: 600px` / `$stream-fit-min-2col: 520px` 是两段各自允许的中列下限；它们**只参与阈值计算**，并不会作为 `min-width` 施加到 `.stream`（`.stream` 仍是 `min-width: 0`）。

右列收起后容器上限同步降到 `180 + 20 + 720 + 边距`，否则中列会独自伸到近 1000px 而显得空旷。左列收起后无需再降：`width: 100%` 已经把容器限制在视口内。

header 的收缩阶梯与主体**解耦**（原先 `$search-collapse-threshold` 与主体断点绑定同一数值，主体断点下移后搜索框会跟着过早只剩图标）。现取 `1400 / 1000 / 860 / 760px`，均按 header 内侧 `1440px` 的实际拥挤程度单独选定。

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
| 4 | 修复 View Transition 未处理拒绝导致的引导页错误覆盖层（阻断验证，详见 §4.2） | `packages/frontend/src/theme.ts` | 已完成（修改） |
| 5 | i18n | `locales/ja-JP.yml` | **无需改动**：所需文案（`timeline` / `explore` / `announcements` / `search` / `settings` / `note` / `more` / `controlPanel` / `account` / `instance` / `notifications`）均为已有键 |
| 6 | 编写本设计文档 | `docs/juejin-layout-design.md` | 已完成 |

未新增 UI 风格，因此 `boot/main-boot.ts` 与 `navbar.ts` 均无需改动（§3.1）。

### 4.1 验证结果

静态检查：

| 项 | 命令 | 结果 |
| --- | --- | --- |
| SPDX 头 | `node scripts/check-spdx.mjs` | `SPDX: OK`（2457 文件通过） |
| 类型检查 | `vue-tsc --noEmit`（`packages/frontend`） | 通过，无报错 |
| ESLint | `eslint --quiet` 针对 3 个改动文件 | 退出 0，无输出 |
| ESLint（含 warning） | `eslint --max-warnings=-1` 同 3 文件 | 仅剩 `universal.vue` 的 2 条 baseline warning（`vue/multi-word-component-names` 与 105 行 `no-unnecessary-condition`），已核对 merge-base `791831a0` 同行同码即已存在 |
| 组件评审 | `.claude/agents/vue-component-reviewer.md`（shipping skill 对 frontend `.vue` 的指定 gate） | 已执行，反馈全部修完，见 §4.3 |
| 汇总脚本 | `node scripts/check-shipping.mjs` | `SPDX: PASS` / `Locale safety: PASS`；`Lint: ERROR` 属**检查不能**（`spawnSync pnpm.cmd EINVAL`，Windows 下脚本无法启动 pnpm），非真实 lint 失败，已由上面两行直接调用 eslint 代偿 |
| locale 安全性 | `git diff --name-only $(git merge-base origin/develop HEAD)...HEAD -- 'locales/*.yml'` | `ja-JP.yml` **未被触碰**；唯一的 locale 改动是 `locales/zh-CN.yml` 的 `note: 发帖 → 发布`，归属并行会话的提交 `0939929f4e`（`fix(frontend): 悬浮面板空间不足时自适应翻转方向`），不属于本次改造 |

浏览器实测（第二轮，对照 §1.5 掘金逐档实测值）：

| 视口 | header 内层 | 三列容器 | 左列 dock | 中列 stream | 右列 sidebar | 与掘金一致 | 横向溢出 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1920px | `1440px` 居中 | `1200px` 居中 | `180px` | `720px` | `260px` | ✓ | 无 |
| 1600px | `1440px` 居中 | `1200px` 居中 | `180px` | `720px` | `260px` | ✓ | 无 |
| 1440px | `1440px`（满宽） | `1200px` 居中 | `180px` | `720px` | `260px` | ✓ | 无 |
| 1280px | 满宽 | `1200px` 居中 | `180px` | `720px` | `260px` | ✓ | 无 |
| 1215px | 满宽 | `1200px` | `180px` | `720px` | `260px` | ✓ | 无 |
| 1214px | 满宽 | 满宽 | 隐藏 | 满宽 | 隐藏 | ✓（同为塌陷档） | 无 |
| 1100px | 满宽 | 满宽 | 隐藏 | `1068px` | 隐藏 | ✓ | 无 |
| 900px | 满宽 | 满宽 | 隐藏 | `868px` | 隐藏 | ✓ | 无 |
| 600px | 满宽 | 满宽 | 隐藏 | `568px` | 隐藏 | ✓ | 无 |
| 420px | **不渲染** | **不渲染** | **不渲染** | **不渲染** | **不渲染** | 移动端分支 | 无 |

> **注意：** 上表是**单一断点时期**（塌陷点 `1214px`）的实测记录，1214px 及以下各档的「隐藏 / 满宽」已不再成立。断点改为两级后的实测见 §7.4。1215px 以上各档与 header 内层 `1440px` 的结论不受影响。

关键校验：

- **页面宽度与掘金完全一致**：1215px 及以上时三列容器恒为 `1200px`，且 `180 + 20 + 720 + 20 + 260 = 1200` 精确成立（gap `20px`、容器无左右 padding），与 §1.2 / §1.5 掘金实测逐档吻合
- header 内层 `1440px`（比主体 `1200px` 宽），1600px 视口下实测 `x=80, w=1440`，与掘金 §1.1 一致
- 塌陷断点 `1214px` 与掘金实测（1215px 成立 / 1201px 起崩坏）对齐，且塌陷方式同为「左右两列一起收起」（**该结论已被 §7 取代**：照搬掘金的塌陷点在本项目会过早丢弃可用空间）
- 420px 下掘金组件全部不渲染，`.nonTitlebarArea` / `.contents` / `XMobileFooterMenu`（`67px`）照常呈现 → **移动端未受影响**
- 滚动实测（1600px 视口）：中列 `_pageScrollable` 滚动 `80px` 后，header 仍在 `top=0`（高度 `60px`），左列 dock 与右列 sidebar 仍在 `top=80`，`document.scrollY` 恒为 `0` → 顶部导航栏「固定不变」成立，且未改动 document 滚动模型
- 滚动容器实测位于中列内部（`_pageScrollable`），`MkStickyContainer` 正常产出 `data-sticky-container-header-height`（实测 `51`）→ 页面吸顶、触底加载、滚动记忆未被破坏（§2.3）
- 宽屏页面 `/admin/job-queue`（`needWideArea`）实测：header 保留，三列容器放开至 `1600px`，左右列隐藏

### 4.2 验证期间遇到的引导页错误覆盖层（与本次改造无关）

验证过程中，开发环境反复出现「加载失败」引导页错误覆盖层（`#errors`）。该覆盖层由 `packages/frontend/public/loader/boot.js` 的 `renderError()` 渲染，会把 `document.body` 整体替换掉，因此覆盖层出现时所有布局元素的 `getBoundingClientRect()` 都会归零 —— 这是测量值异常的直接原因，而非布局本身有问题。

排查结论：**两个独立成因，均与本次改造无关。**

1. **`FORCED_ERROR`**：`localStorage` 中残留了 `forceError='true'`。`boot.js:19-21` 只要读到该键就无条件渲染错误页。清除该键后 900px 等断点立即恢复正常测量。
   - 注意：此前一次「已确认为既有问题」的判定是在该键仍然存在的情况下做出的，那次判定的证据链无效，因此重做了下面第 2 条的隔离实验。
2. **`SOMETHING_HAPPENED_IN_PROMISE`**：既有缺陷，已定位根因并修复（见 §4.3）。隔离实验先确认了它与本次改造无关：
   - 用 `git show HEAD~1:packages/frontend/src/ui/universal.vue` 取出**改造前**的 `universal.vue` 覆盖到工作区（DOM 中确认为原侧边栏、无任何掘金组件），错误**完全一致地复现**；
   - 同一错误也出现在 `?ui=zen` 与 `?ui=deck` 上，而这两个 shell 根本不 import 本次新增的两个组件；
   - 强制覆盖层隐藏后，DOM 中三列布局本身渲染正常、实测宽度正确（§4.1）。

### 4.3 顺带修复：ViewTransition 的 unhandledrejection 导致启动失败画面

抓到的完整异常是 `InvalidStateError: Transition was aborted because of invalid state`，来自 `packages/frontend/src/theme.ts` 的 `applyTheme()`。

成因链：

1. `document.startViewTransition()` 返回的 ViewTransition 暴露三个 promise：`updateCallbackDone` / `ready` / `finished`。
2. 原实现只对 `finished` 挂了 `.then(...)`，**没有 rejection handler**；`ready` 与 `updateCallbackDone` 完全没有接收者。
3. 过渡被中断时（浏览器标签不可见、过渡期间再次触发过渡等），这些 promise 会 reject。没有 handler 的 rejection 冒泡成 `unhandledrejection`。
4. `packages/frontend/public/loader/boot.js` 注册了 `window.onunhandledrejection`，它调用 `renderError('SOMETHING_HAPPENED_IN_PROMISE')`，**把 `document.body` 整体替换成启动失败画面**。

所以一次纯装饰性的主题过渡失败，会连带把整个应用的 DOM 抹掉 —— 这也解释了为什么 `zen` / `deck` / 改造前代码全都中招：它们共用同一个 `theme.ts` 与同一个 `boot.js`。原代码里的 `try~catch` 接不住这个错误，注释中的 FIXME（「viewTransiton エラーは try~catch 貫通してそう」，misskey-dev/misskey#16562）描述的正是该现象。

修复（`packages/frontend/src/theme.ts`）：把失败回退逻辑从 `catch` 节抽成 `onFailed()`，并保证三个 promise 都有 rejection handler ——

- `finished.then(onSucceeded, onFailed)`：过渡正常结束或失败，都会清理 `_themeChanging_` 类并落地主题；
- `ready.catch()` / `updateCallbackDone.catch()`：仅用于消化 rejection，避免升级成 `unhandledrejection`；
- 同步抛出的异常仍由 `try~catch` 兜住，与 `onFailed` 走同一路径。

修复后实测：错误覆盖层不再出现，`#misskey_app` 正常挂载，主题在过渡失败时仍能正确应用（不会卡在 `_themeChanging_` 状态）。这是本次附带修复的既有缺陷，不属于布局改造范围，但不修就无法完成布局的浏览器验证。

### 4.4 `vue-component-reviewer` 的反馈与修复

仓库的 shipping 规约要求「frontend `.vue` 变更须执行 `vue-component-reviewer`」。对三个组件跑完后共 6 项反馈，全部已修：

| 级别 | 反馈 | 处理 |
| --- | --- | --- |
| 🔴 Critical | `locales/zh-CN.yml` 被手动改动（Crowdin 自动配信先，会被覆盖丢失） | **不是本次改造的改动**：`git log -S` 定位到并行会话的 commit `0939929f4e`（悬浮面板方向自适应）。本次改造未触碰任何 locale YAML，`ja-JP.yml` 亦未改动 |
| 🟡 Major | header 中 4 个纯图标控件（通知 / 更多 / 设置 / 头像）只有 `v-tooltip`，无 accessible name | 全部补 `:aria-label`。`v-tooltip` 只 popup `MkTooltip.vue`，不设置 `aria-label` / `title`，Tabler 图标是 `::before` 伪元素也不产生文本 |
| 🟡 Major | 发帖按钮在 ≤900px 时 `.postText` 被 `display: none`，名称完全消失 | 补常驻 `:aria-label="i18n.ts.note"`，名称不再依赖随宽度隐藏的子元素 |
| 🟡 Major | logo 按钮在 ≤1000px 时同样失去名称（`<img alt="">` + 被隐藏的文字） | 补常驻 `:aria-label` |
| 🟡 Major | dock 的 `v-for` 缺 `:key`（`vue/require-v-for-key`），指示器可能因 DOM 复用错位 | 补 `:key="item"` |
| 🔵 Minor | dock 模板里 `v-if="item === '-'"` 是死分支（`menu` 已在 computed 中过滤掉 `'-'`） | 删除死分支并去掉 `<template>` 包装；可见性判定一并移入 computed（用 `Object.hasOwn` 判定键存在，与 `plugin.ts` / `preferences/manager.ts` 一致），避免 `v-if` 与 `v-for` 同元素共存 |
| 🔵 Minor | dock 项 `border-radius: 4px` 硬编码 | 保留 4px（掘金实测值，`--MI-radius` 为 12px 会破坏还原度），并在注释中明示这是有意偏离 |

a11y 修复后实测：header 内 6 个交互控件（logo / 搜索 / 通知 / 更多 / 设置 / 发帖 / 头像）均正确输出 `aria-label`。

未采纳的两项判断（reviewer 自身也标为「适用外」，已复核认同）：`Mk` 前缀与 Storybook 併设规约的对象是 `packages/frontend/src/components/`，而本次两个组件位于 UI shell 层 `ui/_common_/`，该目录 20 个既有文件无一带 `Mk` 前缀、无一带 `*.stories.impl.ts`，新组件的 lowercase-hyphenated 命名与该目录多数派一致。

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

---

## 6. 后续调整：设置页 / 控制面板改为 1200px 两列

### 6.1 问题

三列 shell 落地后，`/settings` 与 `/admin` 这两个「索引页 + 子页面」结构的页面被塞进中列的 `720px` 里。它们本身已经是「左侧菜单 + 右侧内容」的两列布局，再嵌进中列后左菜单只剩两百多像素，右侧表单被挤到无法正常阅读。

### 6.2 根因：`needWideArea` 被子页面覆盖

`universal.vue` 依据 `pageMetadata.needWideArea` 决定是否放开 1200px 上限（§3.2）。两个索引页原先都没有声明该字段，且各自的 `provideMetadataReceiver` 里有这么一行：

```ts
INFO.value.needWideArea = info.needWideArea ?? undefined;
```

子页面的 metadata 会无条件覆盖索引页自己的值。因此只有 `/admin/job-queue` 这类**子页面自己**声明了 `needWideArea: true` 时才是宽版，进入其他任何子页面的瞬间宽度就缩回中列宽。

改法是两步：索引页 `indexInfo` 声明 `needWideArea: true`，并删掉那行覆盖赋值（保留 `childInfo` 赋值，标题/图标等仍随子页面更新）。

### 6.3 最终形态：1200px 居中两列，左菜单卡片化

放开上限后实测为 1600px 满宽，过宽；按掘金主体宽度收敛到 **1200px 居中**，并让左侧菜单从「靠分隔线区分」改为「`--MI_THEME-panel` 背景 + `--MI-radius` 圆角」的卡片，与 dock / sidebar 视觉语言一致。

| 项 | settings | admin |
| --- | --- | --- |
| 1200px 约束 | 沿用已有外层 `_spacer`，`--MI_SPACER-w` 从 `900px` 改为 `1200px` | 无外层 `_spacer`，在 `.wide` 上加 `max-width: calc(1200px + var(--MI-margin) * 2)` + `padding: var(--MI-margin)` |
| 列间隔 | `gap: 20px`（原先靠 nav 的 `padding-right: 32px`） | `gap: 20px`（原先靠 `border-right`） |
| nav 宽度 | `width: 34%; max-width: 280px` | `width: 32%; max-width: 280px` |
| nav 卡片 | `padding: 12px` + `align-self: flex-start`（高度贴合内容） | 原有 `position: sticky` + `overflow: auto` 保留 |

两处细节值得记录，都是「加了卡片背景后才暴露」的问题：

- **admin 的圆角被切**：nav 原为 `height: 100cqh`，加上容器的上下 `padding` 后卡片底部溢出容器、圆角被裁掉。改为 `height: calc(100cqh - var(--MI-margin) * 2)` 并把 `top` 从 `0` 改为 `var(--MI-margin)`。
- **admin 卡片内出现可见滚动条**：nav 是真实滚动容器，卡片化后滚动条直接压在圆角上。按 `universal.vue` 中 dock / sidebar 的既有写法隐藏（`scrollbar-width: none` + `&::-webkit-scrollbar { display: none; }`）。

settings 的 nav 不滚动（`align-self: flex-start`，高度贴合内容），无需处理这两点。

### 6.4 实测结果

1600px 视口下两页均为 nav `280px` + gap `20px` + main `900px` = `1200px`，且左菜单 `background: rgb(24,24,28)`、`border-radius: 12px` 均生效：

| 视口 | settings 容器 / nav / main | admin 容器 / nav / main |
| --- | --- | --- |
| 1600px | `1200` / `280` / `900` | `1200`（`x=200..1400`）/ `280` / `900` |
| 1280px | `1200` / `280` / `900` | `1200` / `280` / `900` |
| 1000px | `926` / `280` / `626` | `968` / `280` / `668` |
| 700px | `626` / `213` / `393` | `668` / `214` / `434` |
| 500 / 400px | `isWide=false`，nav 收起，main 独占 | `isWide=false`，nav 收起，main 独占 |

各档均无横向溢出（`overflowX=false`）。500px / 400px 下两页的 `narrow` 分支（`NARROW_THRESHOLD = 600`）照常塌陷为单列、菜单收起，说明卡片化没有破坏原有的窄屏行为。

`padding` 计入 `max-width` 是为了让**内容**恒为 1200px：admin 在 1600px 下容器外框 `1232px`、内容区正好 `x=200..1400`，与 settings 的 1200px 对齐。1000px 以下 admin 由 `padding` 提供 16px 边距（settings 由 `_spacer` 提供），卡片不再贴屏幕边缘。

### 6.5 验证门

- `pnpm --filter frontend typecheck`：exit 0
- `eslint` 两个文件：0 error；10 个 warning 全部为改动前既有（组件命名 `index`、未使用的 `view` / `pageProps` / `observer` / `headerActions` / `headerTabs`、两处 `no-unnecessary-condition`），本次未新增
- SPDX 头两文件完整保留
- 未触碰任何 locale YAML

---

## 7. 后续调整：塌陷断点由单级改为两级

### 7.1 问题：1214px 单级塌陷丢掉了仍然可用的空间

用户在约 1490 设备像素宽的窗口下截图，三列已经塌陷成只剩中列，左侧 dock 与右侧 sidebar 全部消失，header 搜索框也退化成一个图标 —— 但画面左右明显还有大量空白。

成因是 §3.3 原设计**照搬了掘金的塌陷点**：`$columns-collapse-threshold: 1214px`，且左右两列共用这一个断点。Windows 显示缩放 125% 下，1490 设备像素对应的 CSS 视口约 `1490 / 1.25 ≈ 1192px`，正好落在 1214px 之下，于是两列同时被收起。实测在 1191px 视口下三列的自然宽度只需 `16 + 180 + 20 + 599 + 20 + 260 + 16 = 1111px`，空间是够的 —— 断点比实际需要早了 100px 以上。

掘金的 1214px 之所以合理，是因为它的中列**硬编码 `720px` 不可压缩**，一旦总宽不足就只能整体放弃。本项目的中列是 `flex: 1; min-width: 0`（§3.2 有意差异），本来就能压缩，因此没有必要在同一个点上放弃两列。

### 7.2 改法：右列先收、左列后收，且阈值由列宽推导

塌陷分两级，并且**不再直写像素值**，而是由各列宽度与允许的中列最小宽度算出来，改列宽时阈值自动跟随：

```scss
// 「中列压到这个宽度就该再收一列了」的判断边界。只用于算阈值，
// 并不会作为 min-width 落到 .stream 上 (.stream 仍是 min-width: 0)
$stream-fit-min-3col: 600px;  // 三列并存时中列可压到的下限
$stream-fit-min-2col: 520px;  // 两列时中列可压到的下限

$sidebar-collapse-threshold: $body-side-margin * 2 + $dock-width + $column-gap
	+ $stream-fit-min-3col + $column-gap + $sidebar-width - 1px;  // = 1111px
$dock-collapse-threshold: $body-side-margin * 2 + $dock-width + $column-gap
	+ $stream-fit-min-2col - 1px;                                  // = 751px
```

| 视口宽度 | 行为 |
| --- | --- |
| `>= 1232px` | 三列完整，容器恒为 1200px 内容宽（`180 / 720 / 260`），与掘金一致 |
| `1112px – 1231px` | 三列全部保留，中列随视口压缩（最窄 600px） |
| `752px – 1111px` | 收起右列 sidebar，左列 dock 保留；容器上限改为 `180 + 20 + 720` 的自然宽度，避免中列被拉到 1000px 而显得空旷 |
| `501px – 751px` | 再收起左列 dock，仅剩中列 |
| `<= 500px` / smartphone | 移动端分支，与改造前一致 |

左右余白从「仅窄屏时加」改为**常驻** `padding: 20px 16px 0`，并把这 32px 计入 `max-width`（`1200 + 32 = 1232px`），使**内容**宽度恒为 1200px —— 与 §6.3 里 admin 页的处理方式一致。

header 的逐级收缩断点同步下调，不再与主体塌陷点绑定：`$search-collapse-threshold` 由 `1214px` 改为 `1000px`，`$logo-text-hide-threshold` `1000 → 860px`，`$post-text-hide-threshold` `900 → 760px`。搜索框在 1000px 以上都能保持文字形态。

### 7.3 顺带修复：header nav 在窄屏下末尾项永久不可达

按新阈值实测时发现的既有缺陷：`.nav` 原为 `overflow: hidden`，视口 ≤650px 时导航项总宽 284px 超过可用空间，末尾的「公告」被裁掉且**没有任何办法访问** —— 而 751px 以下 dock 已收起，header nav 是此时唯一的导航入口，因此影响是致命的。

改为横向滚动并沿用项目既有的「保留滚动、只隐藏滚动条」写法（与 `universal.vue` 的 dock / sidebar、§6.3 的 admin nav 一致）：

```scss
overflow-x: auto;
overflow-y: hidden;
scrollbar-width: none;

&::-webkit-scrollbar { display: none; }
```

实测 640 / 600 / 560 / 520px 四档下，`scrollLeft` 均可推到 `scrollWidth - clientWidth` 的末端，末项「公告」完整可见，且不产生 document 横向溢出。

### 7.4 实测结果

逐档实测（`.columns` 外框宽 @ 左偏移 / 三列实宽 / 是否横向溢出）：

| 视口 | 容器 @ x | dock | stream | sidebar | 溢出 |
| --- | --- | --- | --- | --- | --- |
| 1600px | `1232` @ 184 | `180` | `720` | `260` | 无 |
| 1440px | `1232` @ 104 | `180` | `720` | `260` | 无 |
| 1250px | `1232` @ 9 | `180` | `720` | `260` | 无 |
| 1200px | `1200` @ 0 | `180` | `688` | `260` | 无 |
| **1191px**（用户截图对应值） | `1191` @ 0 | `180` | `679` | `260` | 无 |
| 1112px | `1112` @ 0 | `180` | `600` | `260` | 无 |
| 1111px | `1111` @ 0 | `180` | `599` | `260` | 无 |
| 1110px | `952` @ 79 | `180` | `720` | 隐藏 | 无 |
| 1000px | `952` @ 24 | `180` | `720` | 隐藏 | 无 |
| 900px | `900` @ 0 | `180` | `668` | 隐藏 | 无 |
| 752px | `752` @ 0 | `180` | `520` | 隐藏 | 无 |
| 751px | `751` @ 0 | `180` | `519` | 隐藏 | 无 |
| 750px | `750` @ 0 | 隐藏 | `718` | 隐藏 | 无 |
| 600px | `600` @ 0 | 隐藏 | `568` | 隐藏 | 无 |

两个塌陷点精确落在计算值上（1111 → 1110 收右列，751 → 750 收左列），各档均无横向溢出。1191px 下截图确认三列俱在、搜索框为完整文字形态。

对比改造前：三列的存活下限由 1215px 降到 **1112px**，左列 dock 的存活下限由 1215px 降到 **752px**。

### 7.5 `vue-component-reviewer` 的反馈与处理

shipping 规约要求 frontend `.vue` 变更执行 `vue-component-reviewer`。本轮反馈 11 项，采纳 5 项：

| 级别 | 反馈 | 处理 |
| --- | --- | --- |
| 🟡 Major | 同页存在两个 `<nav>`（header 与 dock），辅助技术无法区分两个 navigation landmark | 两处各补 `:aria-label`，复用已有键 `i18n.ts.navbar` / `i18n.ts.menu`，**未新增 locale 键** |
| 🟡 Major | `.sidebar` 的 `padding-bottom` 写在嵌套规则 `&::-webkit-scrollbar` 之后，命中 Dart Sass ≥1.77 的 `mixed-decls` 弃用警告 | 移到 `scrollbar-width` 之前，声明与嵌套规则不再交错 |
| 🔵 Minor | `$stream-min-width` / `$stream-min-width-narrow` 从名字看像会作为 `min-width` 生效，实际只用于算阈值（`.stream` 是 `min-width: 0`） | 改名为 `$stream-fit-min-3col` / `$stream-fit-min-2col` 并补注释说明用途 |
| 🔵 Minor | header 注释写「1112px」而 `universal.vue` 实算为 1111px，两处 off-by-one | 从两侧注释中删掉硬编码实数，只说明推导来源（实数是同步漏的温床） |
| 🔵 Minor | `z-index: 1` 未说明压在什么之上 | 注释补明是压住下方 `.notices` / 三列区，使 header 始终在上层 |

未采纳的主要两项，均为超出本次范围或与既有约定冲突：

- **`aria-current="page"` 缺失**：`MkA.vue` 只输出 `activeClass`，本身不支持 `aria-current`。要修需改动这个被全站约 200 处引用的全局组件，属独立议题，不在断点调整范围内。
- **横向滚动缺少视觉提示（渐隐遮罩 / 滚动按钮）**：隐藏滚动条是本仓库既有约定（`universal.vue` 的 dock / sidebar、§6.3 的 admin nav 均如此）。为 ≤650px 这一窄档加常驻装饰，会让占绝大多数的宽视口场景无谓变复杂；本次优先保证「可达性」这个功能性缺陷被修掉。

### 7.6 验证门

- `pnpm --filter frontend typecheck`：exit 0
- `eslint --quiet` 三个改动文件（`universal.vue` / `juejin-header.vue` / `juejin-dock.vue`）：exit 0，无输出
- `node scripts/check-shipping.mjs`：`SPDX: PASS`（2457 文件）/ `Locale safety: PASS`；`Lint: ERROR` 同 §4.1 属检查不能（Windows 下 `spawnSync pnpm.cmd EINVAL`），已由上一行直接调用 eslint 代偿
- 未触碰任何 locale YAML；移动端 `v-if="isMobile"` 分支与 `MOBILE_THRESHOLD = 500` 未改动

---

## 8. 后续调整：三列「视觉间距」统一为 20px

### 8.1 问题：声明的 20px 不等于看到的 20px

`.columns` 的 `gap` 一直是 `20px`，列**盒子**之间实测也精确是 20px。但用户看到的是卡片之间的距离，而中列的卡片并不铺满自己的列盒子，于是三列的视觉间距并不相等。

1600px 视口实测（卡片外边缘坐标）：

| 元素 | 左边 | 右边 |
| --- | --- | --- |
| dock 卡片 | 200 | **380** |
| 中列盒子 `.stream` | 400 | 1120 |
| 中列卡片 `MkNote` | **424** | **1086** |
| sidebar 卡片 | **1140** | 1400 |

→ 视觉间距 **左 44px / 右 54px**，而不是 20px / 20px；而且左右还不对称。

### 8.2 根因：中列内部有两层内缩

dock 与 sidebar 的卡片都铺满各自列宽（实测 `padding: 0`，卡片宽度 = 列宽），只有中列被内部结构吃掉了两段宽度：

1. **页面级 `._spacer` 的左右内缩**：`style.scss:176-191` 的 `max-width: min(var(--MI_SPACER-w, 100%), calc(100% - (var(--MI_SPACER-max, 24px) * 2)))`，默认每侧 **24px**。这是为「页面直接铺在窗口上」设计的阅读边距，但在三列布局里，列间距已由 `gap` 负责，这 24px 变成了重复的余白。
2. **`._pageScrollable` 的滚动条槽**：中列是真实滚动容器（`overflow-y: scroll`），浏览器为滚动条预留 **10px**。因为只在右侧预留，所以左右不对称 —— 这正是 44 与 54 相差 10px 的来源。

即 `20 + 24 = 44`（左）、`20 + 24 + 10 = 54`（右）。

### 8.3 改法：在 shell 层抵消这两段，且只作用于三列场景

改动集中在 `universal.vue` 的一条规则里，不动全局 `style.scss`，也不动任何页面：

```scss
.columns:not(.wide) > .stream {
	// dock / sidebar 同款处理: 保留滚动能力, 只隐藏滚动条
	// reversed 版 (chat 等) 是成对的, 必须两个都写
	:global(._pageContainer),
	:global(._pageScrollable),
	:global(._pageScrollableReversed) {
		scrollbar-width: none;

		&::-webkit-scrollbar { display: none; }
	}

	// 只抵消正文槽最外层 _spacer 的左右内缩, 上下 padding 作为纵向余白保留
	:global([data-sticky-container-header-height]) :global(._spacer:not(._spacer *)) {
		max-width: min(var(--MI_SPACER-w, 100%), 100%);
	}
}
```

四个刻意的限定：

- **`:not(.wide)`**：settings / admin 这类宽版页没有左右列，`_spacer` 本身承担着 1200px 居中与左右留白（§6.3），必须排除，否则会破坏 §6 的成果。
- **起点限定在 `[data-sticky-container-header-height]`**：该属性在 `MkStickyContainer` 的**正文 div** 上（`MkStickyContainer.vue:13`）。sticky footer 槽是正文 div 的**兄弟**节点，且不是任何 `_spacer` 的后代，若不限定起点，footer 里的 `_spacer` 会被一起抵消（详见 §8.5）。
- **`._spacer:not(._spacer *)`**：只作用于最外层 spacer。嵌套的 `_spacer`（`MkFolder` 等）是内容内部的有意义留白，保持原样。
- **保留 `--MI_SPACER-w`**：页面自定的阅读宽度上限继续生效。例如 `/about` 声明 `600px`、`/play/new` 声明 `700px`，改动后仍按各自宽度居中，不会被强行拉满。

滚动条改为隐藏而非 `scrollbar-gutter: stable`，一是后者的语义正好相反（它是**常驻**保留槽位，无法用于消除槽位），二是为了和本 shell 既有约定一致 —— dock、sidebar（`universal.vue`）、admin nav（§6.3）全部是「留滚动、隐藏条」。

### 8.4 实测结果

1600px 视口下卡片外边缘：dock `200..380` / 中列 `400..1120` / sidebar `1140..1400`，滚动条槽 `0`

→ **视觉间距 左 20px / 右 20px**，与 `gap` 声明值一致且左右对称。

多页面（均无横向溢出）：

| 页面 | 中列内容宽 | 视觉间距 | 说明 |
| --- | --- | --- | --- |
| `/`（时间线） | `720` | 20 / 20 | 铺满列宽 |
| `/explore` | `720` | 20 / 20 | 铺满列宽 |
| `/announcements` | `720` | 20 / 20 | 铺满列宽 |
| `/my/notifications` | `720` | 20 / 20 | 铺满列宽 |
| `/about` | `600` 居中 | 80 / 80 | 页面自定 `--MI_SPACER-w: 600px`，按预期被尊重 |
| `/play/new` | `700` 居中 | 30 / 30 | 页面自定 `--MI_SPACER-w: 700px`，同上 |

后两行不是缺陷：页面声明的阅读宽度**窄于**列宽时保持居中，是 §8.3 第四条限定的预期行为。

多断点（三列并存的各档）：1600 / 1300px 均 `gap=20/20`（中列 `720`）；1200px `gap=20/20`（中列 `688`）；1112px `gap=20/20`（中列 `600`）。1050 / 800px 右列已收起，左侧仍为 20px；700 / 600 / 420px 无横向溢出。

回归项：

- **滚动架构未变**（§2.3 的关键约束）：`_pageScrollable` 仍是滚动容器（`overflow-y: scroll`，`canScroll=true`），`getScrollContainer()` 仍定位到它；滚动后 header 仍在 `top=0`、dock 仍在 `top=80`，`document.scrollY` 恒为 `0`；`MkStickyContainer` 仍正常产出 `data-sticky-container-header-height=51`
- **宽版页未受影响**：`/settings/profile` 仍为 `min(1200px, 100% - 64px)`、`/admin/overview` 的 `_spacer` 仍保留 `100% - 48px` 内缩，左菜单卡片 `284px` 不变（§6 成果完好）
- **移动端未受影响**：420px 重载后走 `v-if="isMobile"` 分支（`hasColumns=false`），`_spacer` 仍保留 `100% - 24px` 内缩

### 8.5 `vue-component-reviewer` 抓到的两个缺陷

首版规则写成 `:global(._spacer:not(._spacer *))` + 只列 `._pageScrollable`，reviewer 指出两处实际会出错的地方，均已复核确认并修正：

| 级别 | 缺陷 | 复核证据 | 处理 |
| --- | --- | --- | --- |
| 🟡 Major | sticky footer 槽内的 `_spacer` 被误伤。footer 是正文 div 的**兄弟**（`MkStickyContainer.vue:19-23`），不是任何 `_spacer` 的后代，故 `:not(._spacer *)` 拦不住它；未声明 `--MI_SPACER-w` 时 `max-width` 退化为 `100%`，左右内缩全部消失 | `/play/new` 的 footer（`flash-edit.vue:26-35`）实测：修复前 `max-width: 100%`，修复后 `min(100%, 100% - 48px)`、`padding: 24/24`，按钮不再贴卡片边缘 | 规则起点限定为 `[data-sticky-container-header-height]`（正文 div） |
| 🟡 Major | 漏掉 `._pageScrollableReversed`。`PageWithHeader` 在 `reversed` 时用的是这个类（`PageWithHeader.vue:7`），`chat/room.vue:7` 实际在用；它同样是 `overflow-y: scroll`，会残留 10px 槽位，导致 chat 页右侧仍是 30px | 该类在 `deck/main-column.vue:82` 就是与 `._pageScrollable` 成对处理的，属仓库既有约定；实测把元素类名换成 reversed 后 `scrollbar-width` 仍为 `none`、槽位 `0` | 选择器补上 `:global(._pageScrollableReversed)` |

未采纳的建议：

- **改用注入 `--MI_SPACER-max: 0px` 代替重写 `max-width`**：方案不可行。该变量同时驱动**上下** padding（`style.scss:181`），置 0 会一并抹掉纵向余白；且 `._spacer` 自身把这三个变量重置为 `initial`（`style.scss:188-190`），祖先注入的值根本传不进去 —— 已实测确认。
- **保留正文滚动条（改为压缩 gap 或负 margin 吸收 10px）**：负 margin 会让内容溢出列盒子并盖住相邻列的命中区域；压缩 `gap` 则会让「声明值」与「视觉值」再次分叉，正是本节要消除的问题。隐藏滚动条与本 shell 既有约定一致（dock / sidebar / admin nav 均如此），滚轮、键盘、触摸、拖拽滚动能力全部保留。
- **`:global()` 触达 `style.scss` 布局原语的耦合风险**：属实，已在规则注释中写明依赖的具体结构（`MkStickyContainer` 正文 div 的 data 属性、`_spacer` 的嵌套语义），便于日后改动时定位。

### 8.6 验证门

- `pnpm --filter frontend typecheck`：exit 0
- `eslint --quiet packages/frontend/src/ui/universal.vue`：exit 0，无输出
- `node scripts/check-spdx.mjs`：`SPDX: OK`（2457 文件）
- `vue-component-reviewer`：已执行，2 项 Major 缺陷（见 §8.5）已修并复测
- 未触碰任何 locale YAML；未改动全局 `style.scss` 与任何页面组件
