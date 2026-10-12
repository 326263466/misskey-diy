<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section v-if="recipient.host == null && ($i?.id !== recipient.id || items.length > 0 || failed)" :class="$style.root" :aria-label="i18n.ts._tip.title">
	<div ref="barrageSlot" :class="[$style.barrageSlot, { [$style.collapsed]: barrageHidden }]">
		<div v-if="showBarrage && items.length > 0" :class="[$style.barrage, { [$style.still]: !canAnimate }]" :style="{ '--tipWidth': `${tipWidth}px` }" :aria-label="i18n.ts._tip.barrage" :tabindex="canAnimate ? undefined : 0">
			<ul v-for="(lane, index) in lanes" :key="index" :class="$style.lane">
				<li v-for="(entry, tipIndex) in lane" :key="`${entry.tip.id}:${tipIndex}`" :class="$style.tip" :data-tone="tipTone(entry.tip.amount)" :aria-hidden="entry.duplicate || undefined" @mouseenter="pauseTip($event, true)" @mouseleave="pauseTip($event, false)">
					<MkAvatar v-if="entry.tip.user" :user="entry.tip.user" :link="false" :class="$style.avatar" title=""/>
					<i v-else class="ti ti-user-circle" :class="$style.deletedAvatar" aria-hidden="true"></i>
					<MkUserName v-if="entry.tip.user" :user="entry.tip.user" :class="$style.name" :noEmojiTooltip="true"/>
					<span v-else :class="$style.name">{{ i18n.ts._tip.deletedUser }}</span>
					<span :class="$style.amount">{{ i18n.tsx._tip.record({ coins: entry.tip.amount.toLocaleString() }) }}</span>
				</li>
			</ul>
		</div>
	</div>
	<div :class="$style.actions">
		<MkButton v-if="$i?.id !== recipient.id" type="button" primary rounded :disabled="opening" :wait="opening" @click="openTip"><i class="ti ti-heart-handshake" aria-hidden="true"></i> {{ i18n.ts._tip.title }}</MkButton>
		<MkButton v-if="items.length > 0" type="button" small :aria-pressed="showBarrage" @click="toggleBarrage">{{ showBarrage ? i18n.ts._tip.hideBarrage : i18n.ts._tip.showBarrage }}</MkButton>
	</div>
	<div v-if="totalCount > 0" :class="$style.summarySlot"><span :class="$style.summary">{{ i18n.tsx._tip.summary({ count: totalCount, coins: totalAmount.toLocaleString() }) }}</span></div>
	<div v-if="failed" :class="$style.error"><span>{{ i18n.ts._tip.historyFailed }}</span><MkButton type="button" small :disabled="loading" @click="load()">{{ i18n.ts.retry }}</MkButton></div>
</section>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import { useDocumentVisibility } from '@@/js/use-document-visibility.js';
import MkButton from '@/components/MkButton.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { pleaseLogin } from '@/utility/please-login.js';
import * as os from '@/os.js';
import { DI } from '@/di.js';

const props = defineProps<{ recipient: entities.UserLite; targetType: 'note' | 'page'; targetId: string; targetTitle?: string }>();
const items = ref<entities.TipsListResponse['items']>([]);
const totalCount = ref(0);
const totalAmount = ref(0);
const loading = ref(false);
const failed = ref(false);
const opening = ref(false);
const showBarrage = ref(true);
let request = 0;
let active = true;
const barrageItems = computed(() => items.value.slice(0, 20));
const barrageSlot = useTemplateRef('barrageSlot');
const viewportWidth = ref(0);
const inViewport = ref(false);
const reducedMotion = ref(false);
const animationSupported = ref(false);
const visibility = useDocumentVisibility();
const pageActive = inject(DI.pageActive, ref(true));
const canAnimate = computed(() => prefer.s.animation && !reducedMotion.value && animationSupported.value);
// 没有弹幕或用户关闭弹幕时收起占位，不留两行空白
const barrageHidden = computed(() => !(showBarrage.value && items.value.length > 0));
const running = computed(() => inViewport.value && visibility.value === 'visible' && pageActive.value);
const tipWidth = computed(() => Math.max(160, Math.min(228, viewportWidth.value - 16)));
const tipGap = 12;
const speed = 42;
const lanes = computed(() => [barrageItems.value.filter((_, index) => index % 2 === 0), barrageItems.value.filter((_, index) => index % 2 === 1)]
	.filter(lane => lane.length > 0)
	.map(lane => {
		const count = canAnimate.value ? Math.min(10, Math.max(lane.length, Math.ceil((viewportWidth.value + tipWidth.value + tipGap) / (tipWidth.value + tipGap)))) : lane.length;
		return Array.from({ length: count }, (_, index) => ({ tip: lane[index % lane.length], duplicate: index >= lane.length }));
	}));
const targetKey = computed(() => `${props.targetType}:${props.targetId}`);

type TipAnimation = { animation: Animation; hovered: boolean };
const animations = new Map<HTMLElement, TipAnimation>();

function tipTone(amount: number) {
	if (amount >= 100) return 'red';
	if (amount >= 50) return 'gold';
	if (amount >= 20) return 'purple';
	if (amount >= 10) return 'green';
	return 'blue';
}

function updatePlayback(record: TipAnimation) {
	if (!running.value || record.hovered) record.animation.pause();
	else record.animation.play();
}

function pauseTip(event: Event, paused: boolean) {
	const record = animations.get(event.currentTarget as HTMLElement);
	if (!record) return;
	record.hovered = paused;
	updatePlayback(record);
}

function clearAnimations() {
	for (const record of animations.values()) {
		record.animation.cancel();
	}
	animations.clear();
}

// 每条独立循环，悬停只暂停自己的播放进度，移开后从原处继续。
watch([lanes, viewportWidth, canAnimate, showBarrage], () => {
	clearAnimations();
	if (!canAnimate.value || !showBarrage.value || !barrageSlot.value || viewportWidth.value === 0) return;
	const interval = (tipWidth.value + tipGap) / speed * 1000;
	const duration = (viewportWidth.value + tipWidth.value + tipGap) / speed * 1000;
	const elements = barrageSlot.value.querySelectorAll('ul');
	for (const [laneIndex, lane] of lanes.value.entries()) {
		const cycle = Math.max(duration, lane.length * interval);
		for (const [index, element] of Array.from(elements[laneIndex]?.children ?? []).entries()) {
			const el = element as HTMLElement;
			const phase = (index * interval + laneIndex * interval / 2) % cycle;
			const exitTransform = `translateX(${-tipWidth.value - tipGap / 2}px)`;
			const animation = el.animate([
				{ transform: `translateX(${viewportWidth.value + tipGap / 2}px)`, offset: 0 },
				{ transform: exitTransform, offset: duration / cycle },
				{ transform: exitTransform, offset: 1 },
			], { duration: cycle, delay: -phase, iterations: Infinity, easing: 'linear', fill: 'both' });
			const record = { animation, hovered: el.matches(':hover') };
			animations.set(el, record);
			updatePlayback(record);
		}
	}
}, { flush: 'post' });

watch(running, () => {
	for (const record of animations.values()) updatePlayback(record);
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
	animationSupported.value = typeof Element.prototype.animate === 'function';
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

// 只加载最近 20 条用于弹幕，底部统计使用接口返回的完整汇总。
async function load() {
	if (!active || props.recipient.host != null) return;
	const sequence = ++request;
	loading.value = true;
	failed.value = false;
	try {
		const result = await misskeyApi('tips/list', { targetType: props.targetType, targetId: props.targetId, limit: 20 });
		if (!active || sequence !== request) return;
		items.value = [...new Map(result.items.map(item => [item.id, item])).values()];
		totalCount.value = result.totalCount;
		totalAmount.value = result.totalAmount;
	} catch {
		if (active && sequence === request) failed.value = true;
	} finally { if (active && sequence === request) loading.value = false; }
}

async function openTip() {
	if (opening.value || props.recipient.host != null || $i?.id === props.recipient.id) return;
	const key = targetKey.value;
	const recipient = props.recipient;
	const target = { type: props.targetType, id: props.targetId, title: props.targetTitle };
	opening.value = true;
	try {
		if (!await pleaseLogin() || !active || key !== targetKey.value) return;
		const component = await import('@/components/MkTipDialog.vue');
		if (!active || key !== targetKey.value) return;
		const { dispose } = os.popup(component.default, { recipient, target }, {
			sent: () => { if (active && key === targetKey.value) void load(); },
			closed: () => dispose(),
		});
	} catch {
		if (active && key === targetKey.value) os.toast(i18n.ts.somethingHappened, 'error');
	} finally { opening.value = false; }
}

watch(targetKey, () => {
	request++;
	items.value = [];
	totalCount.value = 0;
	totalAmount.value = 0;
	loading.value = false;
	failed.value = false;
	void load();
}, { immediate: true });
onBeforeUnmount(() => { active = false; request++; clearAnimations(); });
</script>

<style lang="scss" module>
// 自带与上方内容的 60px 间距，使用方无需再补。
.root { min-width: 0; max-width: 100%; margin-top: 60px; overflow: hidden; }
.actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--MI-marginHalf); min-height: 40px; }
.summarySlot { margin-top: 8px; font-size: .85em; }
.summary { display: block; max-width: 100%; text-align: center; color: var(--MI_THEME-fgTransparentWeak); line-height: 1.5; }
.error { display: flex; align-items: center; justify-content: center; gap: var(--MI-marginHalf); margin-top: var(--MI-marginHalf); font-size: .85em; }
.barrageSlot { height: 88px; margin-bottom: 10px; overflow: hidden; }
.barrageSlot.collapsed { height: 0; margin-bottom: 0; }
.barrage { display: flex; flex-direction: column; gap: 4px; width: 100%; overflow: hidden; mask-image: linear-gradient(90deg, transparent, black 2%, black 98%, transparent); }
.lane { position: relative; flex-shrink: 0; width: 100%; height: 42px; margin: 0; padding: 0; list-style: none; }
.tip { --tipColor: var(--MI-tipBlue); --tipBackground: color-mix(in srgb, var(--tipColor) 14%, var(--MI_THEME-panel)); position: absolute; top: 4px; left: 0; display: flex; align-items: center; gap: 5px; width: max-content; max-width: var(--tipWidth); height: 34px; box-sizing: border-box; padding: 4px 36px 4px 8px; border-radius: 999px 0 0 999px; background: linear-gradient(90deg, var(--tipBackground) calc(100% - 32px), transparent); color: var(--MI_THEME-fg); font-size: .85em; }
.tip[data-tone='green'] { --tipColor: var(--MI-tipGreen); }
.tip[data-tone='purple'] { --tipColor: var(--MI-tipPurple); }
.tip[data-tone='gold'] { --tipColor: var(--MI-tipGold); }
.tip[data-tone='red'] { --tipColor: var(--MI-tipRed); }
.tip:hover { --tipBackground: color-mix(in srgb, var(--tipColor) 22%, var(--MI_THEME-panel)); z-index: 1; }
.avatar { width: 26px; height: 26px; flex-shrink: 0; }
.deletedAvatar { font-size: 26px; }
.name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.amount { flex-shrink: 0; white-space: nowrap; color: color-mix(in srgb, var(--tipColor) 70%, var(--MI_THEME-fg)); font-weight: 600; font-variant-numeric: tabular-nums; }
.still { overflow-x: auto; mask-image: none; scrollbar-width: none; }
.still:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
.still .lane { display: flex; align-items: center; gap: 12px; width: max-content; }
.still .tip { position: relative; top: 0; flex-shrink: 0; }
</style>
