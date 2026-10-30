<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section v-if="recipient.host == null && ($i?.id !== recipient.id || items.length > 0 || failed)" :class="$style.root" :aria-label="i18n.ts._tip.title">
	<div ref="barrageSlot" :class="[$style.barrageSlot, { [$style.collapsed]: barrageHidden }]">
		<div v-if="showBarrage && items.length > 0" :class="[$style.barrage, { [$style.still]: !canAnimate }]" :style="{ '--tipWidth': `${tipWidth}px` }" :aria-label="i18n.ts._tip.barrage" :tabindex="canAnimate ? undefined : 0">
			<ul v-for="(lane, index) in lanes" :key="index" :class="$style.lane">
				<li v-for="entry in lane" :key="entry.key" :class="$style.tip" :data-tone="tipTone(entry.tip.amount)" :aria-hidden="entry.duplicate || undefined" @mouseenter="pauseTip($event, true)" @mouseleave="pauseTip($event, false)">
					<MkAvatar v-if="entry.tip.user" :user="entry.tip.user" :link="false" :class="$style.avatar" title=""/>
					<i v-else class="ti ti-user-circle" :class="$style.deletedAvatar" aria-hidden="true"></i>
					<MkUserName v-if="entry.tip.user" :user="entry.tip.user" :class="$style.name" :noEmojiTooltip="true"/>
					<span v-else :class="$style.name">{{ i18n.ts._tip.deletedUser }}</span>
					<span :class="$style.amount">{{ i18n.tsx._tip.record({ coins: entry.tip.amount.toLocaleString() }) }}</span>
				</li>
			</ul>
		</div>
	</div>
	<div v-if="$i?.id !== recipient.id" :class="$style.actions">
		<p :class="$style.prompt">{{ i18n.ts._tip.prompt }}</p>
		<button type="button" class="_button" :class="$style.tipButton" :disabled="opening" :aria-busy="opening" @click="openTip">{{ i18n.ts._tip.title }}</button>
	</div>
	<div v-if="totalCount > 0" :class="$style.supporters">
		<ul v-if="visibleTips.length > 0" :class="$style.avatars" :aria-label="i18n.ts._tip.history">
			<li v-for="tip in visibleTips" :key="tip.id">
				<button v-if="tip.user" type="button" class="_button" :class="$style.supporter" :aria-label="userName(tip.user)" @click="openUserPanel(tip.user, $event)"><MkAvatar :user="tip.user" :class="$style.supporterAvatar" imageOnly title=""/></button>
				<i v-else class="ti ti-user-circle" :class="$style.supporterDeleted" aria-hidden="true"></i>
			</li>
			<li v-if="hiddenCount > 0"><button type="button" class="_button" :class="$style.more" :aria-label="i18n.tsx._tip.moreSupporters({ n: hiddenCount.toLocaleString() })" @click="openList">+{{ hiddenCount > 99 ? '99' : hiddenCount }}</button></li>
		</ul>
		<button type="button" class="_button" :class="$style.summary" @click="openList">{{ i18n.tsx._tip.summary({ count: totalCount, coins: totalAmount.toLocaleString() }) }}<i class="ti ti-chevron-right" aria-hidden="true"></i></button>
		<button v-if="items.length > 0" type="button" class="_button" :class="$style.toggle" :aria-pressed="showBarrage" @click="toggleBarrage">{{ showBarrage ? i18n.ts._tip.hideBarrage : i18n.ts._tip.showBarrage }}</button>
	</div>
	<div v-else-if="loading" :class="$style.supporters"><span :class="$style.summary">{{ i18n.ts.loading }}</span></div>
	<div v-if="failed" :class="$style.error"><span>{{ i18n.ts._tip.historyFailed }}</span><MkButton type="button" small :disabled="loading" @click="load()">{{ i18n.ts.retry }}</MkButton></div>
</section>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import { useDocumentVisibility } from '@@/js/use-document-visibility.js';
import { userName } from '@@/js/user.js';
import MkButton from '@/components/MkButton.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { pleaseLogin } from '@/utility/please-login.js';
import * as os from '@/os.js';
import { DI } from '@/di.js';
import { tipTone } from '@/utility/tip.js';
import { useGlobalEvent } from '@/events.js';

const props = defineProps<{ recipient: entities.UserLite; targetType: 'note' | 'page'; targetId: string }>();
const items = ref<entities.TipsListResponse['items']>([]);
const totalCount = ref(0);
const totalAmount = ref(0);
const loading = ref(false);
const failed = ref(false);
const opening = ref(false);
const showBarrage = ref(true);
let request = 0;
let active = true;
let refreshQueued = false;
let refreshTimer: number | undefined;
let incomingTimer: number | undefined;
let controller: AbortController | undefined;
let entryId = 0;
type Tip = entities.TipsListResponse['items'][number];
type BarrageEntry = { key: number; tip: Tip; delay: number };
const animatedLanes = ref<BarrageEntry[][]>([]);
let incomingTips: Tip[] = [];
const barrageItems = computed(() => items.value.slice(0, 20));
const barrageSlot = useTemplateRef('barrageSlot');
const viewportWidth = ref(0);
const inViewport = ref(false);
const reducedMotion = ref(false);
const visibility = useDocumentVisibility();
const pageActive = inject(DI.pageActive, ref(true));
const canAnimate = computed(() => prefer.s.animation && !reducedMotion.value);
// 没有弹幕或用户关闭弹幕时收起占位，不留两行空白
const barrageHidden = computed(() => !(showBarrage.value && items.value.length > 0));
const running = computed(() => inViewport.value && visibility.value === 'visible' && pageActive.value);
const refreshActive = computed(() => visibility.value === 'visible' && pageActive.value && props.recipient.host == null);
const tipWidth = computed(() => Math.max(160, Math.min(228, viewportWidth.value - 16)));
const tipGap = 12;
const speed = 72;
const lanes = computed(() => {
	if (!canAnimate.value) return [0, 1]
		.map(lane => barrageItems.value.flatMap((tip, index) => index % 2 === lane ? [{ key: index, tip, duplicate: false }] : []))
		.filter(lane => lane.length > 0);
	const seen = new Set<string>();
	return animatedLanes.value.map(lane => lane.map(entry => {
		const duplicate = seen.has(entry.tip.id);
		seen.add(entry.tip.id);
		return { ...entry, duplicate };
	}));
});
const targetKey = computed(() => `${props.targetType}:${props.targetId}`);
// 参考微信赞赏，头像墙最多两行；同一用户的多次打赏合并为一个头像。
const avatarSize = 28;
const avatarGap = 4;
const avatarRowMax = 11;
const avatarRows = 2;
const avatarSlots = computed(() => {
	const width = Math.min(viewportWidth.value || Infinity, avatarRowMax * (avatarSize + avatarGap) - avatarGap);
	return Math.max(1, Math.floor((width + avatarGap) / (avatarSize + avatarGap))) * avatarRows;
});
const supporterTips = computed(() => {
	const map = new Map<string, { id: string; user: entities.UserLite | null; amount: number }>();
	for (const tip of items.value) {
		const key = tip.user?.id ?? 'deleted';
		const existing = map.get(key);
		if (existing) {
			existing.amount = Math.round((existing.amount + tip.amount) * 100) / 100;
		} else {
			map.set(key, { id: tip.id, user: tip.user, amount: tip.amount });
		}
	}
	return [...map.values()];
});
const visibleTips = computed(() => supporterTips.value.slice(0, supporterTips.value.length > avatarSlots.value ? avatarSlots.value - 1 : avatarSlots.value));
const hiddenCount = computed(() => Math.max(0, supporterTips.value.length - visibleTips.value.length));

type TipAnimation = { animation: Animation; hovered: boolean; entry: BarrageEntry; cycle: number; delay: number; assignedStart: number };
const animations = new Map<HTMLElement, TipAnimation>();

function updatePlayback(record: TipAnimation) {
	if (!running.value || record.hovered) record.animation.pause();
	else record.animation.play();
}

function pauseTip(event: Event, paused: boolean) {
	const record = animations.get(event.currentTarget as HTMLElement);
	if (!record) return;
	record.hovered = paused;
	updatePlayback(record);
	scheduleIncoming();
}

function clearAnimations() {
	window.clearTimeout(incomingTimer);
	incomingTimer = undefined;
	for (const record of animations.values()) {
		record.animation.cancel();
	}
	animations.clear();
}

function createLane(tips: Tip[], lane: number, incoming = false): BarrageEntry[] {
	const count = Math.min(10, Math.max(tips.length, Math.ceil((viewportWidth.value + tipWidth.value + tipGap) / (tipWidth.value + tipGap))));
	const interval = (tipWidth.value + tipGap) / speed * 1000;
	return Array.from({ length: count }, (_, index) => ({
		key: ++entryId,
		tip: tips[index % tips.length],
		delay: incoming ? (index + lane / 2) * interval : -(index + lane / 2) * interval,
	}));
}

// 首屏保留负相位错位；列表刷新只更新数据，不重新铺开正在滚动的弹幕。
watch([viewportWidth, canAnimate, barrageHidden], () => {
	clearAnimations();
	incomingTips = [];
	animatedLanes.value = [];
	if (!canAnimate.value || barrageHidden.value || viewportWidth.value === 0) return;
	animatedLanes.value = [0, 1].map(lane => barrageItems.value.filter((_, index) => index % 2 === lane))
		.filter(lane => lane.length > 0)
		.map((lane, index) => createLane(lane, index));
});

watch(animatedLanes, () => {
	if (!canAnimate.value || barrageHidden.value || !barrageSlot.value || viewportWidth.value === 0) return;
	const interval = (tipWidth.value + tipGap) / speed * 1000;
	const duration = (viewportWidth.value + tipWidth.value + tipGap) / speed * 1000;
	const elements = barrageSlot.value.querySelectorAll('ul');
	for (const [laneIndex, lane] of animatedLanes.value.entries()) {
		const cycle = Math.max(duration, lane.length * interval);
		for (const [index, element] of Array.from(elements[laneIndex]?.children ?? []).entries()) {
			const el = element as HTMLElement;
			if (animations.has(el)) continue;
			const entry = lane[index];
			const exitTransform = `translateX(${-tipWidth.value - tipGap / 2}px)`;
			const travel = duration / cycle;
			const fade = Math.min(0.1, 300 / duration);
			const animation = el.animate([
				{ transform: `translateX(${viewportWidth.value + tipGap / 2}px)`, opacity: 0, offset: 0 },
				{ opacity: 1, offset: fade * travel },
				{ opacity: 1, offset: 0.97 * travel },
				{ transform: exitTransform, opacity: 0, offset: travel },
				{ transform: exitTransform, opacity: 0, offset: 1 },
			], { duration: cycle, delay: entry.delay, iterations: Infinity, easing: 'linear', fill: 'both' });
			const record = { animation, hovered: el.matches(':hover'), entry, cycle, delay: entry.delay, assignedStart: 0 };
			animations.set(el, record);
			updatePlayback(record);
		}
	}
	scheduleIncoming();
}, { flush: 'post' });

// 等弹幕完全离开左侧再换入新记录，下次从右侧进入，动画对象和进度都不变。
function scheduleIncoming() {
	window.clearTimeout(incomingTimer);
	incomingTimer = undefined;
	if (!running.value || incomingTips.length === 0) return;
	const edgeTime = tipGap / 2 / speed * 1000;
	let wait = Infinity;
	for (const record of animations.values()) {
		if (record.hovered) continue;
		const elapsed = Number(record.animation.currentTime ?? 0) - record.delay;
		const cycleStart = Math.floor(elapsed / record.cycle) * record.cycle;
		const start = record.assignedStart < cycleStart && elapsed - cycleStart <= edgeTime ? cycleStart : cycleStart + record.cycle;
		const nextStart = Math.max(start, record.assignedStart + record.cycle);
		const remaining = nextStart - elapsed - edgeTime;
		if (remaining <= 0) {
			record.entry.tip = incomingTips.shift()!;
			record.assignedStart = nextStart;
			if (incomingTips.length === 0) return;
		} else {
			wait = Math.min(wait, remaining);
		}
	}
	if (Number.isFinite(wait)) incomingTimer = window.setTimeout(scheduleIncoming, Math.max(1, wait));
}

watch(running, () => {
	for (const record of animations.values()) updatePlayback(record);
	scheduleIncoming();
});

watch(barrageSlot, (element, _, onCleanup) => {
	if (!element) { inViewport.value = false; viewportWidth.value = 0; return; }
	let observing = true;
	viewportWidth.value = Math.round(element.getBoundingClientRect().width);
	const resize = new ResizeObserver(entries => {
		if (observing) viewportWidth.value = Math.round(entries[0].contentRect.width);
	});
	const intersection = new IntersectionObserver(entries => { if (observing) inViewport.value = entries[0].isIntersecting; });
	resize.observe(element);
	intersection.observe(element);
	onCleanup(() => { observing = false; resize.disconnect(); intersection.disconnect(); clearAnimations(); });
});

onMounted(() => {
	const media = window.matchMedia('(prefers-reduced-motion: reduce)');
	const update = () => { reducedMotion.value = media.matches; };
	update();
	media.addEventListener('change', update);
	onBeforeUnmount(() => media.removeEventListener('change', update));
});

try { showBarrage.value = miLocalStorage.getItem('tip-barrage-hidden') !== 'true'; } catch { /* 存储不可用时仍可在当前页面关闭弹幕。 */ }

function toggleBarrage() {
	showBarrage.value = !showBarrage.value;
	try { miLocalStorage.setItem('tip-barrage-hidden', String(!showBarrage.value)); } catch { /* 当前页面的开关仍然生效。 */ }
}

// 只加载最近 30 条用于弹幕和头像墙，底部统计使用接口返回的完整汇总。
async function load() {
	if (!active || props.recipient.host != null) return;
	if (loading.value) { refreshQueued = true; return; }
	window.clearTimeout(refreshTimer);
	refreshTimer = undefined;
	refreshQueued = false;
	const sequence = ++request;
	controller = new AbortController();
	loading.value = true;
	failed.value = false;
	try {
		const result = await misskeyApi('tips/list', { targetType: props.targetType, targetId: props.targetId, limit: 30 }, undefined, controller.signal);
		if (!active || sequence !== request) return;
		const previous = new Map(items.value.map(item => [item.id, item]));
		const latest = [...new Map(result.items.map(item => [item.id, item])).values()].sort((a, b) => a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
		const added = latest.filter(item => !previous.has(item.id) && items.value.length > 0 && item.id > items.value[0].id);
		items.value = latest.map(item => {
			const existing = previous.get(item.id);
			return existing ? Object.assign(existing, item) : item;
		});
		totalCount.value = result.totalCount;
		totalAmount.value = result.totalAmount;
		if (animatedLanes.value.length > 0 && added.length > 0) {
			incomingTips = [...incomingTips, ...added.reverse()].slice(-30);
			if (animatedLanes.value.length === 1) animatedLanes.value = [...animatedLanes.value, createLane(incomingTips.splice(0, 10), 1, true)];
			scheduleIncoming();
		}
	} catch {
		if (active && sequence === request) failed.value = true;
	} finally {
		if (active && sequence === request) {
			loading.value = false;
			controller = undefined;
			if (refreshQueued && refreshActive.value) {
				refreshQueued = false;
				void load();
			} else {
				window.clearTimeout(refreshTimer);
				if (refreshActive.value) refreshTimer = window.setTimeout(() => { void load(); }, 15000);
			}
		}
	}
}

useGlobalEvent('contentTipSent', target => {
	if (target.targetType === props.targetType && target.targetId === props.targetId) void load();
});

watch(refreshActive, enabled => {
	window.clearTimeout(refreshTimer);
	if (enabled) void load();
});

async function openList() {
	if (props.recipient.host != null) return;
	try {
		const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkTipListDialog.vue').then(module => module.default), {
			targetType: props.targetType,
			targetId: props.targetId,
		}, { closed: () => dispose() });
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	}
}

async function openUserPanel(user: entities.UserLite, event: MouseEvent) {
	const source = event.currentTarget as HTMLElement;
	const showing = ref(true);
	try {
		const component = (await import('@/components/MkUserPopup.vue')).default;
		const { dispose } = os.popup(component, { showing, q: user.id, source, interactive: true }, {
			close: () => { showing.value = false; },
			closed: () => dispose(),
		});
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	}
}

async function openTip() {
	if (opening.value || props.recipient.host != null || $i?.id === props.recipient.id) return;
	const key = targetKey.value;
	const recipient = props.recipient;
	const target = { type: props.targetType, id: props.targetId };
	opening.value = true;
	try {
		if (!await pleaseLogin() || !active || key !== targetKey.value) return;
		const component = await import('@/components/MkTipDialog.vue');
		if (!active || key !== targetKey.value) return;
		const { dispose } = os.popup(component.default, { recipient, target }, { closed: () => dispose() });
	} catch {
		if (active && key === targetKey.value) os.toast(i18n.ts.somethingHappened, 'error');
	} finally { opening.value = false; }
}

watch(targetKey, () => {
	request++;
	controller?.abort();
	window.clearTimeout(refreshTimer);
	clearAnimations();
	animatedLanes.value = [];
	incomingTips = [];
	refreshQueued = false;
	items.value = [];
	totalCount.value = 0;
	totalAmount.value = 0;
	loading.value = false;
	failed.value = false;
	if (refreshActive.value) void load();
}, { immediate: true });
onBeforeUnmount(() => {
	active = false;
	request++;
	controller?.abort();
	window.clearTimeout(refreshTimer);
	clearAnimations();
});
</script>

<style lang="scss" module>
// 自带与上方内容的 60px 间距，使用方无需再补。
.root { min-width: 0; max-width: 100%; margin-top: 60px; overflow: hidden; }
.actions { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.prompt { margin: 0; color: var(--MI_THEME-fgTransparent); font-size: .9em; line-height: 1.5; }
.tipButton {
	min-width: 112px;
	min-height: 40px;
	padding: 0 28px;
	color: #fff;
	font-size: 15px;
	font-weight: 600;
	background: var(--MI-tipButton);
	border-radius: 999px;
	transition: filter .15s ease;

	&:not(:disabled):hover { filter: brightness(.94); }
	&:focus-visible { outline: 2px solid var(--MI-tipButton); outline-offset: 3px; }
	&:disabled { opacity: .6; cursor: wait; }
}

.supporters { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 20px; }
.avatars { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; max-width: 348px; margin: 0; padding: 0; list-style: none; }
.supporter {
	display: block;
	cursor: pointer;

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}
.supporterAvatar { display: block; width: 28px; height: 28px; }
.supporterDeleted { display: block; font-size: 28px; line-height: 1; color: var(--MI_THEME-fgTransparentWeak); }
.more {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	color: var(--MI_THEME-fgTransparent);
	font-size: 11px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	background: var(--MI_THEME-buttonBg);
	border-radius: 50%;

	&:hover { color: var(--MI_THEME-fg); background: var(--MI_THEME-buttonHoverBg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}
.summary {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	max-width: 100%;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
	font-variant-numeric: tabular-nums;
	line-height: 1.5;
	border-radius: 3px;

	&:hover { color: var(--MI_THEME-fg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}
.toggle {
	padding: 2px 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 12px;
	line-height: 1.5;
	border-radius: 3px;

	&:hover { color: var(--MI_THEME-fg); text-decoration: underline; text-underline-offset: 3px; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}

@media (prefers-reduced-motion: reduce) {
	.tipButton { transition: none; }
}

.error { display: flex; align-items: center; justify-content: center; gap: var(--MI-marginHalf); margin-top: var(--MI-marginHalf); font-size: .85em; }
.barrageSlot { height: 88px; margin-bottom: 10px; overflow: hidden; }
.barrageSlot.collapsed { height: 0; margin-bottom: 0; }
.barrage { display: flex; flex-direction: column; gap: 4px; width: 100%; overflow: hidden; mask-image: linear-gradient(90deg, transparent, black 2%, black 98%, transparent); }
.lane { position: relative; flex-shrink: 0; width: 100%; height: 42px; margin: 0; padding: 0; list-style: none; }
.tip { --tipColor: var(--MI-tipBlue); --tipBackground: color-mix(in srgb, var(--tipColor) 14%, var(--MI_THEME-panel)); position: absolute; top: 4px; left: 0; display: flex; align-items: center; gap: 5px; width: max-content; max-width: var(--tipWidth); height: 34px; box-sizing: border-box; padding: 4px 36px 4px 8px; border-radius: 999px 0 0 999px; background: linear-gradient(90deg, var(--tipBackground) calc(100% - 32px), transparent); color: var(--MI_THEME-fg); font-size: .85em; opacity: 0; }
.tip[data-tone='green'] { --tipColor: var(--MI-tipGreen); }
.tip[data-tone='purple'] { --tipColor: var(--MI-tipPurple); }
.tip[data-tone='gold'] { --tipColor: var(--MI-tipGold); }
.tip[data-tone='red'] { --tipColor: var(--MI-tipRed); }
.tip:hover { --tipBackground: color-mix(in srgb, var(--tipColor) 22%, var(--MI_THEME-panel)); z-index: 1; }
.avatar { width: 26px; height: 26px; flex-shrink: 0; }
.deletedAvatar { font-size: 26px; }
.name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.amount { flex-shrink: 0; white-space: nowrap; color: color-mix(in srgb, var(--tipColor) 70%, var(--MI_THEME-fg)); font-weight: 400; font-variant-numeric: tabular-nums; }
.still { overflow-x: auto; mask-image: none; scrollbar-width: none; }
.still:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
.still .lane { display: flex; align-items: center; gap: 12px; width: max-content; }
.still .tip { position: relative; top: 0; flex-shrink: 0; opacity: 1; }
</style>
