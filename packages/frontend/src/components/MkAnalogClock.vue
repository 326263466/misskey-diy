<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<svg
	:class="[$style.root, $style[design], { [$style.englishWords]: design === 'words' && wordLayout === 'en' }]"
	:style="dialColors"
	:viewBox="rectangular ? undefined : circularViewBox"
	:data-clock-design="design"
	role="img"
	:aria-label="`${timeLabel}:${ss}`"
>
	<template v-if="design === 'hud'">
		<path
			v-for="(path, i) in secondSegments"
			:key="i"
			:d="path"
			:class="[$style.segment, { [$style.lit]: i <= s }]"
			:opacity="i <= s ? 0.25 + i / 80 : 1"
		/>
		<circle :class="$style.track" cx="90" cy="90" r="63" stroke-width="0.6"/>
		<line v-for="angle in [0, 90, 180, 270]" :key="angle" :class="$style.accent" x1="90" y1="24" x2="90" y2="31" stroke-width="1.4" :transform="`rotate(${angle} 90 90)`"/>
		<text :class="$style.caption" x="90" y="62">{{ dateLabel }}</text>
		<text :class="$style.digitalTime" x="90" y="90">{{ timeLabel }}</text>
		<text :class="$style.caption" x="90" y="116">{{ ss }} {{ i18n.ts._time.second }}</text>
	</template>
	<template v-else-if="design === 'linear'">
		<text x="0" y="10" :class="$style.shapeCaption">{{ dateLabel }}</text>
		<text x="0" y="50" :class="[$style.shapeDigits, $style.shapeHero]">{{ hh }}</text>
		<text x="52" y="48" :class="$style.shapeSeparator">:</text>
		<text x="68" y="50" :class="[$style.shapeDigits, $style.shapeHero]">{{ mm }}</text>
		<text x="100%" y="48" :class="[$style.shapeDigits, $style.shapeSeconds, $style.shapeAccent]" text-anchor="end">{{ ss }}</text>
		<svg x="0" y="67" width="100%" height="11" viewBox="20 98 184 13" preserveAspectRatio="none" overflow="visible">
			<path v-for="(path, i) in linearTicks" :key="i" :d="path" :class="$style.shapeTrack"/>
			<path d="M20 111H204" :class="$style.shapeTrack"/>
			<path :d="`M20 111H${minutePosition}`" :class="$style.shapeAccentLine" stroke-width="1.5"/>
		</svg>
		<svg :x="`${minuteProgress * 100}%`" y="60" width="1" height="1" overflow="visible" data-clock-minute-marker>
			<path d="M-3 0L0 4L3 0Z" :class="$style.shapeAccent"/>
		</svg>
		<g :class="$style.shapeCaption" text-anchor="middle">
			<text v-for="(label, i) in ['00', '15', '30', '45', '60']" :key="i" :x="`${i * 25}%`" y="104" :text-anchor="i === 0 ? 'start' : i === 4 ? 'end' : 'middle'">{{ label }}</text>
		</g>
		<svg x="0" y="122" width="100%" height="1" viewBox="20 0 184 1" preserveAspectRatio="none" overflow="visible">
			<path d="M20 0H204" :class="$style.shapeTrack"/>
			<path :d="`M${Math.max(20, secondPosition - 26)} 0H${secondPosition}`" :class="[$style.shapeAccentLine, $style.shapeGlow]" stroke-width="1.2"/>
		</svg>
		<circle :cx="`${secondProgress * 100}%`" cy="122" r="1.6" :class="[$style.shapeAccent, $style.shapeGlow]" data-clock-second-marker/>
	</template>
	<template v-else-if="design === 'digital'">
		<text x="0" y="10" :class="$style.shapeCaption">{{ dateLabel }}</text>
		<svg v-for="(digit, i) in clockDigits" :key="i" :x="digitPositions[i]" y="28" width="26" height="56" viewBox="-1 0 32 68" :data-clock-digit="i">
			<polygon v-for="(points, segment) in digitSegments" :key="segment" :points="points" :class="[$style.digitalSegment, { [$style.lit]: activeDigitSegments[Number(digit)].includes(String(segment)) }]"/>
		</svg>
		<circle cx="50%" cy="52" r="1.6" :class="$style.shapeAccent"/>
		<circle cx="50%" cy="68" r="1.6" :class="$style.shapeAccent"/>
		<line x1="0" y1="98" x2="100%" y2="98" :class="$style.shapeTrack"/>
		<rect v-for="i in 30" :key="i" :x="`${(i - 1) * 5 / 184 * 100}%`" y="113" width="1.6" height="7" rx="0.8" :class="[$style.digitalSegment, { [$style.lit]: i - 1 <= s / 2 }]"/>
		<text x="100%" y="116.5" dominant-baseline="central" :class="[$style.shapeDigits, $style.shapeSeconds, $style.shapeAccent]" text-anchor="end">{{ ss }}</text>
	</template>
	<template v-else-if="design === 'words'">
		<g text-anchor="middle" dominant-baseline="central">
			<text
				v-for="(cell, i) in wordCells"
				:key="i"
				:x="`${(i % wordColumns) / (wordColumns - 1) * 100}%`"
				:y="wordLayout === 'en' ? 12 + Math.floor(i / wordColumns) * 14 : 8 + Math.floor(i / wordColumns) * 20"
				:text-anchor="i % wordColumns === 0 ? 'start' : i % wordColumns === wordColumns - 1 ? 'end' : 'middle'"
				:class="[$style.word, { [$style.englishWord]: wordLayout === 'en', [$style.lit]: cell.lit, [$style.period]: cell.period }]"
			>{{ cell.letter }}</text>
		</g>
		<template v-if="wordLayout === 'en'">
			<circle v-for="(point, i) in [[0, 2], [100, 2], [100, 150], [0, 150]]" :key="i" :cx="`${point[0]}%`" :cy="point[1]" r="1.4" :class="[$style.word, { [$style.lit]: i < m % 5 }]"/>
		</template>
	</template>
	<template v-else>
		<circle :class="$style.track" cx="90" cy="90" :r="design === 'orbit' ? 78 : 77" :stroke-width="design === 'orbit' ? 0.7 : 0.6"/>
		<line
			v-for="i in 60"
			:key="i"
			:class="[$style.tick, { [$style.majorTick]: i % 5 === 0 }]"
			x1="90" :y1="design === 'orbit' ? 19 : 18" x2="90" :y2="(design === 'orbit' ? 19 : 18) + (i % 5 === 0 ? 5 : 2)"
			:transform="`rotate(${i * 6} 90 90)`"
		/>
		<text v-for="(label, i) in dialLabels" :key="i" :class="$style.caption" :x="90 + Math.sin(i * Math.PI / 2) * (design === 'orbit' ? 55 : 57)" :y="90 - Math.cos(i * Math.PI / 2) * (design === 'orbit' ? 55 : 57)">{{ label }}</text>
		<template v-if="design === 'orbit'">
			<g :transform="`rotate(${smoothSeconds * 6} 90 90)`">
				<path v-for="(path, i) in orbitTrail" :key="i" :class="[$style.accent, $style.glow]" :d="path" stroke-width="1.6" :opacity="0.06 + i * 0.095"/>
				<circle :class="[$style.light, $style.glow]" cx="90" cy="12" r="2.4"/>
			</g>
			<line :class="$style.hand" x1="90" y1="94" x2="90" y2="56" :stroke-width="3.3 * handScale" :transform="`rotate(${hAngle * 180 / Math.PI} 90 90)`"/>
			<line :class="$style.hand" x1="90" y1="95" x2="90" y2="41" :stroke-width="2 * handScale" :transform="`rotate(${mAngle * 180 / Math.PI} 90 90)`"/>
		</template>
		<template v-else>
			<circle :class="$style.subDial" cx="65" cy="87" r="26"/>
			<line
				v-for="i in 12"
				:key="i"
				:class="[$style.tick, { [$style.majorTick]: i % 3 === 0 }]"
				x1="65" y1="65" x2="65" :y2="i % 3 === 0 ? 70 : 67"
				:transform="`rotate(${i * 30} 65 87)`"
			/>
			<line :class="$style.hand" x1="65" y1="91" x2="65" y2="71" :stroke-width="2.6 * handScale" :transform="`rotate(${hAngle * 180 / Math.PI} 65 87)`"/>
			<circle :class="$style.pivot" cx="65" cy="87" r="2.2"/>
			<circle :class="$style.subDial" cx="119" cy="118" r="20"/>
			<g :transform="`rotate(${smoothSeconds * 6} 119 118)`">
				<path :class="[$style.accent, $style.glow]" :d="satelliteTrail" stroke-width="1.8"/>
				<circle :class="$style.light" cx="119" cy="98" r="1.9"/>
			</g>
			<text :class="$style.digitalSeconds" x="119" y="118">{{ ss }}</text>
			<line :class="$style.hand" x1="90" y1="97" x2="90" y2="29" :stroke-width="2 * handScale" :transform="`rotate(${mAngle * 180 / Math.PI} 90 90)`"/>
		</template>
		<circle :class="$style.pivot" cx="90" cy="90" :r="design === 'orbit' ? 3.3 : 3"/>
	</template>
</svg>
</template>

<script lang="ts" setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import tinycolor from 'tinycolor2';
import { i18n } from '@/i18n.js';
import { themeManager } from '@/theme.js';
import { defaultIdlingRenderScheduler } from '@/utility/idle-render.js';

const props = withDefaults(defineProps<{
	design?: 'orbit' | 'hud' | 'satellite' | 'linear' | 'digital' | 'words';
	thickness?: number;
	offset?: number;
	now?: () => Date;
}>(), {
	design: 'linear',
	thickness: 0.2,
	offset: 0 - new Date().getTimezoneOffset(),
	now: () => new Date(),
});

const handScale = computed(() => props.thickness / 0.2);
const rectangular = computed(() => props.design === 'linear' || props.design === 'digital' || props.design === 'words');
// 各圆形表盘外沿半径不同（78/77/76），viewBox 按外沿收紧，空边只留卡片内边距一层
const circularViewBox = computed(() => props.design === 'orbit' ? '11 11 158 158' : '12 12 156 156');
const dialColors = ref<Record<string, string>>({});
const date = ref(getAdjustedTime());
const h = computed(() => date.value.getUTCHours());
const m = computed(() => date.value.getUTCMinutes());
const s = computed(() => date.value.getUTCSeconds());
const smoothSeconds = computed(() => s.value + date.value.getUTCMilliseconds() / 1000);
const hAngle = computed(() => Math.PI * (h.value % 12 + (m.value + smoothSeconds.value / 60) / 60) / 6);
const mAngle = computed(() => Math.PI * (m.value + smoothSeconds.value / 60) / 30);
const ss = computed(() => s.value.toString().padStart(2, '0'));
const hh = computed(() => h.value.toString().padStart(2, '0'));
const mm = computed(() => m.value.toString().padStart(2, '0'));
const timeLabel = computed(() => `${hh.value}:${mm.value}`);
const dateLabel = computed(() => `${(date.value.getUTCMonth() + 1).toString().padStart(2, '0')}/${date.value.getUTCDate().toString().padStart(2, '0')}`);
const minuteProgress = computed(() => (m.value + smoothSeconds.value / 60) / 60);
const secondProgress = computed(() => smoothSeconds.value / 60);
const minutePosition = computed(() => 20 + minuteProgress.value * 184);
const secondPosition = computed(() => 20 + secondProgress.value * 184);
const clockDigits = computed(() => [...`${hh.value}${mm.value}`]);
const digitPositions = ['calc(50% - 72px)', 'calc(50% - 38px)', 'calc(50% + 12px)', 'calc(50% + 46px)'];
const linearTicks = Array.from({ length: 61 }, (_, i) => `M${20 + i * 184 / 60} ${i % 15 === 0 ? 98 : i % 5 === 0 ? 103 : 107}V111`);
const digitSegments = ['4,0 26,0 30,4 26,8 4,8 0,4', '27,9 31,5 31,27 27,31 23,27 23,13', '27,33 31,37 31,59 27,63 23,59 23,37', '4,60 26,60 30,64 26,68 4,68 0,64', '3,33 7,37 7,59 3,63 -1,59 -1,37', '3,9 7,13 7,27 3,31 -1,27 -1,5', '4,30 26,30 30,34 26,38 4,38 0,34'];
const activeDigitSegments = ['012345', '12', '01346', '01236', '1256', '02356', '023456', '012', '0123456', '012356'];
const wordLayout = i18n.ts._widgetOptions._clock.wordClockLayout;
const wordColumns = wordLayout === 'en' ? 11 : 7;
const wordCells = computed(() => {
	const lit = new Set<number>();
	const period = new Set<number>();
	const add = (start: number, length: number) => {
		for (let i = start; i < start + length; i++) lit.add(i);
	};
	if (wordLayout === 'en') {
		add(0, 2);
		add(3, 2);
		const minute = Math.floor(m.value / 5) * 5;
		const hours = [[93, 6], [55, 3], [74, 3], [61, 5], [66, 4], [70, 4], [58, 3], [88, 5], [77, 5], [51, 4], [99, 3], [82, 6]];
		const [start, length] = hours[(h.value + (minute > 30 ? 1 : 0)) % 12];
		add(start, length);
		if (minute === 0) {
			add(104, 6);
		} else {
			add(minute > 30 ? 42 : 44, minute > 30 ? 2 : 4);
			const minutes = [[28, 4], [38, 3], [13, 7], [22, 6], [22, 10], [33, 4]];
			const [minuteStart, minuteLength] = minutes[(minute > 30 ? 60 - minute : minute) / 5 - 1];
			add(minuteStart, minuteLength);
		}
	} else {
		[0, 1, 2, 27, 47].forEach(i => lit.add(i));
		const periodCells = wordLayout === 'ja' ? h.value < 12 ? [7, 8] : [9, 10] : h.value < 6 ? [3, 4] : h.value < 12 ? [7, 8] : h.value < 18 ? [9, 10] : [11, 12];
		periodCells.forEach(i => { lit.add(i); period.add(i); });
		const hour = h.value % 12 || 12;
		if (hour >= 10) {
			lit.add(24);
			if (hour > 10) lit.add(24 + hour - 10);
		} else {
			lit.add(hour <= 6 ? 14 + hour : 21 + hour - 7);
		}
		if (m.value === 0 || (wordLayout === 'zh' && m.value < 10)) lit.add(28);
		if (m.value >= 10) {
			lit.add(34);
			if (m.value >= 20) lit.add(28 + Math.floor(m.value / 10));
		}
		const one = m.value % 10;
		if (one) lit.add(one <= 6 ? 35 + one : 42 + one - 7);
	}
	return [...i18n.ts._widgetOptions._clock.wordClockGrid].map((letter, i) => ({ letter, lit: lit.has(i), period: period.has(i) }));
});
const dialLabels = computed(() => props.design === 'satellite' ? ['00', '15', '30', '45'] : ['12', '3', '6', '9']);
const secondSegments = Array.from({ length: 60 }, (_, i) => arcPath(76, i * 6 + 1.2, i * 6 + 4.8));
const orbitTrail = Array.from({ length: 8 }, (_, i) => arcPath(78, -36 + i * 4.5, -32 + i * 4.5));
const satelliteTrail = arcPath(20, -60, 0, 119, 118);

function arcPath(radius: number, start: number, end: number, cx = 90, cy = 90): string {
	const from = start * Math.PI / 180;
	const to = end * Math.PI / 180;
	return `M${cx + Math.sin(from) * radius} ${cy - Math.cos(from) * radius} A${radius} ${radius} 0 0 1 ${cx + Math.sin(to) * radius} ${cy - Math.cos(to) * radius}`;
}

function getAdjustedTime(): Date {
	return new Date(props.now().getTime() + props.offset * 60_000);
}

function tick() {
	const now = getAdjustedTime();
	const smooth = props.design === 'orbit' || props.design === 'satellite' || props.design === 'linear';
	if (smooth ? now.getTime() === date.value.getTime() : Math.floor(now.getTime() / 1000) === Math.floor(date.value.getTime() / 1000)) return;
	date.value = now;
}

watch(() => props.offset, tick);

function calcColors() {
	const themeValue = themeManager.currentCompiledTheme!;
	const dark = tinycolor(themeValue.bg).isDark();
	const periodColor = tinycolor.mix(themeValue.accent, themeValue.fg, 50);
	dialColors.value = {
		'--MI-clockDial-fg': dark ? '#e2eae5' : '#3b4941',
		'--MI-clockDial-soft': dark ? '#a2afa7' : '#68756d',
		'--MI-clockDial-track': dark ? '#35423b' : '#dce5df',
		'--MI-clockDial-inactive': dark ? '#53625a' : '#b7c3bc',
		'--MI-clockShape-accent': dark ? 'var(--MI_THEME-accent)' : 'color-mix(in srgb, var(--MI_THEME-accent), black 50%)',
		'--MI-clockDial-period': tinycolor.isReadable(themeValue.panel ?? themeValue.bg, periodColor, { level: 'AA', size: 'small' }) ? periodColor.toHexString() : themeValue.fg,
	};
}

calcColors();

onMounted(() => {
	defaultIdlingRenderScheduler.add(tick);
	themeManager.on('themeChanged', calcColors);
});

onBeforeUnmount(() => {
	defaultIdlingRenderScheduler.delete(tick);
	themeManager.off('themeChanged', calcColors);
});
</script>

<style lang="scss" module>
.root {
	display: block;
	max-width: 100%;
	aspect-ratio: 1;
	overflow: visible;
}

.linear, .digital {
	height: 128px;
	aspect-ratio: auto;
}

.words {
	height: 136px;
	aspect-ratio: auto;
}

.englishWords { height: 152px; }

.shapeCaption { fill: var(--MI-clockDial-soft); font-size: 10px; }
.shapeDigits { fill: var(--MI-clockDial-fg); font-family: "SFMono-Regular", Consolas, monospace; font-variant-numeric: tabular-nums; }
.shapeHero { font-size: 35px; }
.shapeSeparator { fill: var(--MI-clockDial-soft); font-size: 26px; }
.shapeSeconds { font-size: 14px; }
.shapeTrack { fill: none; stroke: var(--MI-clockDial-track); stroke-width: 0.8; vector-effect: non-scaling-stroke; }
.shapeAccentLine { fill: none; stroke: var(--MI-clockShape-accent); stroke-linecap: round; vector-effect: non-scaling-stroke; }
.shapeAccent { fill: var(--MI-clockShape-accent); }
.shapeGlow { filter: drop-shadow(0 0 2px color-mix(in srgb, var(--MI-clockShape-accent), transparent 60%)); }
.digitalSegment {
	fill: color-mix(in srgb, var(--MI-clockDial-track), transparent 42%);

	&.lit { fill: var(--MI-clockDial-fg); }
}

.word {
	font-size: 14px;
	font-weight: 400;
	fill: var(--MI-clockDial-inactive);

	&.lit { fill: var(--MI-clockDial-fg); }
		&.period {
			fill: var(--MI-clockDial-period);
		}
}

.englishWord { font-size: 11px; }

.track, .subDial, .tick, .segment {
	fill: none;
	stroke: var(--MI-clockDial-track);
}

.tick { stroke-width: 0.7; }
.majorTick {
	stroke: var(--MI-clockDial-soft);
	stroke-width: 1.2;
}

.segment {
	stroke-width: 3;

	&.lit { stroke: var(--MI_THEME-accent); }
}

.caption, .digitalTime, .digitalSeconds {
	text-anchor: middle;
	dominant-baseline: central;
}

.caption {
	fill: var(--MI-clockDial-soft);
	font-size: 14px;
	font-weight: 400;
}

.digitalTime, .digitalSeconds {
	fill: var(--MI-clockDial-fg);
	font-family: "SFMono-Regular", Consolas, monospace;
	font-variant-numeric: tabular-nums;
}

.digitalTime { font-size: 31px; }
.digitalSeconds { font-size: 14px; }

.hand {
	stroke: var(--MI-clockDial-fg);
	stroke-linecap: round;
}

.accent {
	fill: none;
	stroke: var(--MI_THEME-accent);
	stroke-linecap: round;
}

.light { fill: var(--MI_THEME-accent); }

.glow {
	filter: drop-shadow(0 0 2px color-mix(in srgb, var(--MI_THEME-accent), transparent 35%));
}

.subDial, .pivot { fill: var(--MI_THEME-panel); }
.subDial { stroke-width: 1; }
.pivot {
	stroke: var(--MI_THEME-accent);
	stroke-width: 1.1;
}
</style>
