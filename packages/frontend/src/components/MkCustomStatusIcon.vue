<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="[$style.root, $style[icon ?? 'add']]" :data-custom-status-icon="icon ?? 'add'" aria-hidden="true">
	<span :class="$style.glyph"><span :class="$style.detail"></span></span>
</span>
</template>

<script lang="ts" setup>
import type { CustomStatusIcon } from '@/utility/status-icons.js';

defineProps<{
	icon?: CustomStatusIcon | null;
}>();
</script>

<style lang="scss" module>
.root {
	--MI-customStatusStart: var(--MI-statusCustomStart);
	--MI-customStatusEnd: var(--MI-statusCustomEnd);

	position: relative;
	display: inline-block;
	flex-shrink: 0;
	width: var(--MI-statusIconSize, 1em);
	aspect-ratio: 1;
	container-type: inline-size;
	border-radius: 50%;
	background-color: var(--MI-customStatusEnd);
	background-image: linear-gradient(var(--MI-customStatusStart), var(--MI-customStatusEnd));
	color: var(--MI-statusForeground);
	vertical-align: middle;
	line-height: 1;
	pointer-events: none;
}

.glyph,
.detail {
	position: absolute;
	inset: 0;

	&::before,
	&::after {
		position: absolute;
		box-sizing: border-box;
		content: '';
	}
}

.add .glyph {
	&::before,
	&::after {
		inset: 45% 24%;
		border-radius: 5cqi;
		background: currentColor;
	}

	&::after {
		transform: rotate(90deg);
	}
}

.coffee {
	--MI-customStatusStart: var(--MI-statusCoffeeStart);
	--MI-customStatusEnd: var(--MI-statusCoffeeEnd);

	.glyph::before {
		inset: 39% 32% 28% 27%;
		border-radius: 2cqi 2cqi 12cqi 12cqi;
		background: currentColor;
	}

	.glyph::after {
		inset: 40% 21% 37% 59%;
		border: 6cqi solid currentColor;
		border-radius: 0 12cqi 12cqi 0;
	}

	.detail::before {
		inset: 20% 43% 68% 35%;
		background: linear-gradient(90deg, currentColor 22%, transparent 22%, transparent 72%, currentColor 72%);
	}

	.detail::after {
		inset: 76% 25% 20%;
		border-radius: 2cqi;
		background: currentColor;
	}
}

.music {
	--MI-customStatusStart: var(--MI-statusMusicStart);
	--MI-customStatusEnd: var(--MI-statusMusicEnd);

	.glyph::before {
		inset: 58% 46% 23% 28%;
		border-radius: 50%;
		background: currentColor;
		transform: rotate(-20deg);
	}

	.glyph::after {
		inset: 23% 45% 32% 47%;
		border-radius: 3cqi 0 0;
		background: currentColor;
	}

	.detail::before {
		inset: 23% 24% 48% 51%;
		border-radius: 0 8cqi 10cqi 0;
		background: currentColor;
		clip-path: polygon(0 0, 100% 26%, 100% 79%, 0 52%);
	}
}

.gamepad {
	--MI-customStatusStart: var(--MI-statusGamepadStart);
	--MI-customStatusEnd: var(--MI-statusGamepadEnd);

	.glyph::before {
		inset: 32% 20% 28%;
		border-radius: 11cqi 11cqi 8cqi 8cqi;
		background: currentColor;
		clip-path: polygon(15% 0, 85% 0, 94% 19%, 100% 79%, 91% 100%, 78% 100%, 61% 74%, 39% 74%, 22% 100%, 9% 100%, 0 79%, 6% 19%);
	}

	.glyph::after {
		inset: 41% 51% 42% 32%;
		background: var(--MI-customStatusEnd);
		clip-path: polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%);
	}

	.detail::before {
		inset: 40% 27% 44% 57%;
		background:
			radial-gradient(circle at 25% 74%, var(--MI-customStatusEnd) 0 20%, transparent 23%),
			radial-gradient(circle at 76% 26%, var(--MI-customStatusEnd) 0 20%, transparent 23%);
	}
}

.briefcase {
	--MI-customStatusStart: var(--MI-statusBriefcaseStart);
	--MI-customStatusEnd: var(--MI-statusBriefcaseEnd);

	.glyph::before {
		inset: 37% 23% 27%;
		border-radius: 5cqi;
		background: currentColor;
	}

	.glyph::after {
		inset: 24% 38% 57%;
		border: 5cqi solid currentColor;
		border-radius: 5cqi 5cqi 0 0;
	}

	.detail::before {
		inset: 49% 23% 46%;
		background: var(--MI-customStatusEnd);
	}

	.detail::after {
		inset: 47% 46% 42%;
		border-radius: 1cqi;
		background: currentColor;
	}
}

.book {
	--MI-customStatusStart: var(--MI-statusBookStart);
	--MI-customStatusEnd: var(--MI-statusBookEnd);

	.glyph::before {
		inset: 28% 23% 26%;
		background: currentColor;
		clip-path: polygon(0 0, 40% 8%, 50% 17%, 60% 8%, 100% 0, 100% 82%, 62% 91%, 50% 100%, 38% 91%, 0 82%);
	}

	.glyph::after {
		inset: 37% 48% 30%;
		border-radius: 2cqi;
		background: var(--MI-customStatusEnd);
	}
}

.moon {
	--MI-customStatusStart: var(--MI-statusMoonStart);
	--MI-customStatusEnd: var(--MI-statusMoonEnd);

	.glyph::before {
		inset: 24% 25% 24%;
		border-radius: 50%;
		background: currentColor;
		mask-image: radial-gradient(circle at 75% 24%, transparent 43%, currentColor 45%);
	}
}

.heart {
	--MI-customStatusStart: var(--MI-statusHeartStart);
	--MI-customStatusEnd: var(--MI-statusHeartEnd);

	.glyph {
		inset: 28% 24% 22%;

		&::before,
		&::after {
			top: 0;
			left: 50%;
			width: 50%;
			height: 80%;
			border-radius: 14cqi 14cqi 0 0;
			background: currentColor;
			transform: rotate(-45deg);
			transform-origin: 0 100%;
		}

		&::after {
			left: 0;
			transform: rotate(45deg);
			transform-origin: 100% 100%;
		}
	}
}

.plane {
	--MI-customStatusStart: var(--MI-statusPlaneStart);
	--MI-customStatusEnd: var(--MI-statusPlaneEnd);

	.glyph::before {
		inset: 0;
		background: currentColor;
		clip-path: polygon(46% 19%, 54% 19%, 58% 40%, 78% 55%, 78% 64%, 57% 55%, 56% 72%, 64% 78%, 64% 84%, 50% 79%, 36% 84%, 36% 78%, 44% 72%, 43% 55%, 22% 64%, 22% 55%, 42% 40%);
		transform: rotate(35deg);
	}
}

.food {
	--MI-customStatusStart: var(--MI-statusInvisibleStart);
	--MI-customStatusEnd: var(--MI-statusInvisibleEnd);

	.glyph::before {
		inset: 25% 55% 25% 28%;
		background: currentColor;
		clip-path: polygon(0 0, 20% 0, 20% 30%, 40% 30%, 40% 0, 60% 0, 60% 30%, 80% 30%, 80% 0, 100% 0, 100% 42%, 68% 50%, 68% 100%, 32% 100%, 32% 50%, 0 42%);
	}

	.glyph::after {
		inset: 24% 27% 47% 55%;
		border-radius: 50%;
		background: currentColor;
	}

	.detail::before {
		inset: 45% 33% 25% 61%;
		border-radius: 0 0 3cqi 3cqi;
		background: currentColor;
	}
}

.home {
	--MI-customStatusStart: var(--MI-statusBookStart);
	--MI-customStatusEnd: var(--MI-statusBookEnd);

	.glyph::before {
		inset: 0;
		background: currentColor;
		clip-path: polygon(19% 46%, 50% 21%, 81% 46%, 75% 53%, 70% 49%, 70% 77%, 30% 77%, 30% 49%, 25% 53%);
	}

	.glyph::after {
		inset: 56% 44% 23%;
		border-radius: 2cqi 2cqi 0 0;
		background: var(--MI-customStatusEnd);
	}
}

.pet {
	--MI-customStatusStart: var(--MI-statusCoffeeStart);
	--MI-customStatusEnd: var(--MI-statusCoffeeEnd);

	.glyph::before {
		inset: 48% 31% 24%;
		border-radius: 50% 50% 42% 42%;
		background: currentColor;
	}

	.glyph::after {
		inset: 22% 20% 40%;
		background:
			radial-gradient(ellipse 12% 23% at 14% 66%, currentColor 95%, transparent 100%),
			radial-gradient(ellipse 13% 27% at 37% 29%, currentColor 95%, transparent 100%),
			radial-gradient(ellipse 13% 27% at 65% 29%, currentColor 95%, transparent 100%),
			radial-gradient(ellipse 12% 23% at 88% 66%, currentColor 95%, transparent 100%);
	}
}

.code {
	--MI-customStatusStart: var(--MI-statusGamepadStart);
	--MI-customStatusEnd: var(--MI-statusGamepadEnd);

	.glyph::before,
	.glyph::after {
		inset: 33% 59% 33% 20%;
		background: currentColor;
		clip-path: polygon(71% 0, 100% 19%, 42% 50%, 100% 81%, 71% 100%, 0 50%);
	}

	.glyph::after {
		inset: 33% 20% 33% 59%;
		transform: rotate(180deg);
	}

	.detail::before {
		inset: 28% 47% 28%;
		border-radius: 3cqi;
		background: currentColor;
		transform: rotate(17deg);
	}
}

.focus {
	--MI-customStatusStart: var(--MI-statusMoonStart);
	--MI-customStatusEnd: var(--MI-statusMoonEnd);

	.glyph::before {
		inset: 23%;
		border-radius: 50%;
		background: radial-gradient(circle closest-side, currentColor 0 17%, transparent 20% 40%, currentColor 43% 56%, transparent 59% 77%, currentColor 80% 100%);
	}
}

.film {
	--MI-customStatusStart: var(--MI-statusMusicStart);
	--MI-customStatusEnd: var(--MI-statusMusicEnd);

	.glyph::before {
		inset: 40% 24% 24%;
		border-radius: 2cqi 2cqi 5cqi 5cqi;
		background: currentColor;
	}

	.glyph::after {
		inset: 25% 24% 62%;
		border-radius: 3cqi 3cqi 0 0;
		background: repeating-linear-gradient(120deg, currentColor 0 11cqi, var(--MI-customStatusEnd) 11cqi 16cqi);
		transform: rotate(-12deg);
		transform-origin: left bottom;
	}

	.detail::before {
		inset: 48% 41% 32% 44%;
		border-radius: 1cqi;
		background: var(--MI-customStatusEnd);
		clip-path: polygon(0 0, 100% 50%, 0 100%);
	}
}

.car {
	--MI-customStatusStart: var(--MI-statusBriefcaseStart);
	--MI-customStatusEnd: var(--MI-statusBriefcaseEnd);

	.glyph::before {
		inset: 27% 22% 30%;
		border-radius: 5cqi;
		background: currentColor;
		clip-path: polygon(15% 0, 85% 0, 100% 45%, 100% 90%, 88% 100%, 12% 100%, 0 90%, 0 45%);
	}

	.glyph::after {
		inset: 33% 31% 52%;
		border-radius: 2cqi;
		background: var(--MI-customStatusEnd);
		clip-path: polygon(9% 0, 91% 0, 100% 100%, 0 100%);
	}

	.detail::before {
		inset: 52% 28% 37%;
		background:
			radial-gradient(circle at 12% 50%, var(--MI-customStatusEnd) 0 3cqi, transparent 3.3cqi),
			radial-gradient(circle at 88% 50%, var(--MI-customStatusEnd) 0 3cqi, transparent 3.3cqi);
	}

	.detail::after {
		inset: 65% 27% 23%;
		border-radius: 2cqi;
		background: linear-gradient(90deg, currentColor 20%, transparent 20% 80%, currentColor 80%);
	}
}

.vacation {
	--MI-customStatusStart: var(--MI-statusInvisibleStart);
	--MI-customStatusEnd: var(--MI-statusInvisibleEnd);

	.glyph::before {
		inset: 21% 34% 57% 16%;
		border-radius: 50% 50% 0 0;
		background: currentColor;
		clip-path: polygon(0 0, 100% 0, 100% 100%, 75% 85%, 50% 100%, 25% 85%, 0 100%);
	}

	.glyph::after {
		inset: 39% 57% 22% 39%;
		border-radius: 2cqi;
		background: currentColor;
	}

	.detail::before {
		inset: 0;
		background: currentColor;
		clip-path: polygon(46% 47%, 50% 45%, 61% 63%, 82% 63%, 82% 68%, 75% 68%, 81% 79%, 76% 81%, 70% 68%, 66% 68%, 59% 80%, 54% 78%, 60% 67%);
	}

	.detail::after {
		inset: 26% 21% 66% 71%;
		border-radius: 50%;
		background: currentColor;
	}
}

.exercise {
	--MI-customStatusStart: var(--MI-statusBookStart);
	--MI-customStatusEnd: var(--MI-statusBookEnd);

	.glyph {
		transform: rotate(-35deg);

		&::before {
			inset: 46% 22% 46%;
			border-radius: 2cqi;
			background: currentColor;
		}

		&::after {
			inset: 31% 61% 31% 28%;
			border-radius: 3cqi;
			background: currentColor;
		}
	}

	.detail::before {
		inset: 31% 28% 31% 61%;
		border-radius: 3cqi;
		background: currentColor;
	}

	.detail::after {
		inset: 39% 20%;
		border-radius: 2cqi;
		background: linear-gradient(90deg, currentColor 12%, transparent 12% 88%, currentColor 88%);
	}
}

.sun {
	--MI-customStatusStart: var(--MI-statusSunStart);
	--MI-customStatusEnd: var(--MI-statusSunEnd);

	.glyph::before {
		inset: 36%;
		border-radius: 50%;
		background: currentColor;
	}

	.glyph::after {
		inset: 13%;
		border-radius: 50%;
		background: repeating-conic-gradient(from -5deg, currentColor 0deg 10deg, transparent 10deg 45deg);
		mask-image: radial-gradient(circle closest-side, transparent 54%, currentColor 57% 75%, transparent 78%);
	}
}

.cloud {
	--MI-customStatusStart: var(--MI-statusAwayStart);
	--MI-customStatusEnd: var(--MI-statusAwayEnd);

	.glyph::before {
		inset: 27% 29% 35% 34%;
		border-radius: 50%;
		background: currentColor;
	}

	.glyph::after {
		inset: 41% 50% 29% 22%;
		border-radius: 50%;
		background: currentColor;
	}

	.detail::before {
		inset: 44% 22% 29% 50%;
		border-radius: 50%;
		background: currentColor;
	}

	.detail::after {
		inset: 53% 25% 28%;
		border-radius: 0 0 9cqi 9cqi;
		background: currentColor;
	}
}

.battery {
	--MI-customStatusStart: var(--MI-statusBookStart);
	--MI-customStatusEnd: var(--MI-statusBookEnd);

	.glyph::before {
		inset: 34% 26% 32% 20%;
		border: 4.5cqi solid currentColor;
		border-radius: 5cqi;
	}

	.glyph::after {
		inset: 44% 19% 42% 75%;
		border-radius: 0 2cqi 2cqi 0;
		background: currentColor;
	}

	.detail::before {
		inset: 39% 38% 37% 36%;
		background: currentColor;
		clip-path: polygon(57% 0, 100% 0, 68% 39%, 99% 39%, 21% 100%, 39% 57%, 0 57%);
	}
}

.chat {
	--MI-customStatusStart: var(--MI-statusPlaneStart);
	--MI-customStatusEnd: var(--MI-statusPlaneEnd);

	.glyph::before {
		inset: 27% 22% 32%;
		border-radius: 12cqi;
		background: currentColor;
	}

	.glyph::after {
		inset: 60% 55% 23% 30%;
		background: currentColor;
		clip-path: polygon(0 0, 100% 0, 0 100%);
	}

	.detail::before {
		inset: 41% 29% 45%;
		background:
			radial-gradient(circle at 17% 50%, var(--MI-customStatusEnd) 0 2.7cqi, transparent 3cqi),
			radial-gradient(circle at 50% 50%, var(--MI-customStatusEnd) 0 2.7cqi, transparent 3cqi),
			radial-gradient(circle at 83% 50%, var(--MI-customStatusEnd) 0 2.7cqi, transparent 3cqi);
	}
}

.celebrate {
	--MI-customStatusStart: var(--MI-statusSunStart);
	--MI-customStatusEnd: var(--MI-statusSunEnd);

	.glyph::before {
		inset: 0;
		background: currentColor;
		clip-path: polygon(23% 78%, 33% 43%, 58% 68%);
	}

	.glyph::after {
		inset: 25% 32% 51% 49%;
		border: 5cqi solid currentColor;
		border-left-color: transparent;
		border-bottom-color: transparent;
		border-radius: 7cqi;
		transform: rotate(17deg);
	}

	.detail::before {
		inset: 0;
		background:
			radial-gradient(circle at 29% 29%, currentColor 0 2.8cqi, transparent 3.2cqi),
			radial-gradient(circle at 72% 26%, currentColor 0 2.8cqi, transparent 3.2cqi),
			radial-gradient(circle at 71% 64%, currentColor 0 2.8cqi, transparent 3.2cqi);
	}

	.detail::after {
		inset: 45% 19% 42% 67%;
		background: currentColor;
		clip-path: polygon(42% 0, 61% 32%, 100% 42%, 68% 64%, 57% 100%, 36% 68%, 0 57%, 32% 35%);
	}
}

.gift {
	--MI-customStatusStart: var(--MI-statusHeartStart);
	--MI-customStatusEnd: var(--MI-statusHeartEnd);

	.glyph::before {
		inset: 45% 25% 24%;
		border-radius: 0 0 4cqi 4cqi;
		background: currentColor;
	}

	.glyph::after {
		inset: 33% 21% 58%;
		border-radius: 2cqi;
		background: currentColor;
	}

	.detail::before {
		inset: 33% 47% 24%;
		background: var(--MI-customStatusEnd);
	}

	.detail::after {
		inset: 19% 32% 66%;
		border-radius: 5cqi;
		background: currentColor;
		clip-path: polygon(0 0, 30% 3%, 50% 43%, 70% 3%, 100% 0, 100% 62%, 68% 100%, 50% 69%, 32% 100%, 0 62%);
	}
}

.handshake {
	--MI-customStatusStart: var(--MI-statusCoffeeStart);
	--MI-customStatusEnd: var(--MI-statusCoffeeEnd);

	.glyph::before {
		inset: 0;
		background: currentColor;
		clip-path: polygon(16% 41%, 27% 29%, 41% 37%, 49% 34%, 57% 36%, 63% 40%, 74% 30%, 85% 42%, 76% 57%, 70% 56%, 59% 69%, 53% 73%, 46% 71%, 31% 59%, 27% 55%, 23% 57%);
	}

	.glyph::after {
		inset: 0;
		background: var(--MI-customStatusEnd);
		clip-path: polygon(41% 38%, 47% 35%, 55% 35%, 63% 41%, 59% 46%, 51% 41%, 44% 48%, 39% 46%, 37% 43%);
	}

	.detail::before {
		inset: 0;
		background: var(--MI-customStatusEnd);
		clip-path: polygon(29% 31%, 33% 34%, 24% 56%, 21% 53%, 29% 31%, 68% 35%, 71% 32%, 80% 54%, 77% 57%, 68% 35%);
	}

	.detail::after {
		inset: 54% 33% 32% 49%;
		background: repeating-linear-gradient(45deg, transparent 0 6cqi, var(--MI-customStatusEnd) 6cqi 8cqi);
		clip-path: polygon(0 58%, 67% 0, 100% 43%, 33% 100%);
	}
}
</style>
