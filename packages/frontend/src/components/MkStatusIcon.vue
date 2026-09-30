<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCustomStatusIcon v-if="status === 'custom'" :icon="icon"/>
<span v-else :class="[$style.root, $style[status], { [$style.plain]: plain }]" aria-hidden="true">
	<i :class="[glyph, $style.glyph]"></i>
</span>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkCustomStatusIcon from '@/components/MkCustomStatusIcon.vue';
import type { CustomStatusIcon, StatusIconStatus } from '@/utility/status-icons.js';

const props = defineProps<{
	status: StatusIconStatus;
	icon?: CustomStatusIcon | null;
	plain?: boolean;
}>();

const glyph = computed(() => {
	switch (props.status) {
		case 'online': return 'ti ti-circle-filled';
		case 'active': return props.plain ? 'ti ti-circle-filled' : 'ti ti-circle-dot';
		case 'away': return props.plain ? 'ti ti-clock' : 'ti ti-moon';
		case 'busy': return 'ti ti-minus';
		case 'doNotDisturb': return 'ti ti-ban';
		case 'invisible': return props.plain ? 'ti ti-equal' : 'ti ti-eye-off';
		case 'offline': return 'ti ti-circle';
		default: return 'ti ti-dots';
	}
});
</script>

<style lang="scss" module>
.root {
	--MI-statusColor: var(--MI_THEME-fg);

	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	// Consumers size this through --MI-statusIconSize so nothing can collide with the width.
	width: var(--MI-statusIconSize, 1em);
	aspect-ratio: 1 / 1;
	container-type: inline-size;
	border-radius: 50%;
	vertical-align: middle;
	color: color-mix(in srgb, var(--MI-statusColor) 15%, var(--MI_THEME-fg));
	background: color-mix(in srgb, var(--MI-statusColor) 18%, var(--MI_THEME-panel));
	line-height: 1;
}

.glyph {
	display: grid;
	place-items: center;
	width: 1em;
	height: 1em;
	font-size: 70cqi;
	line-height: 1;
	vertical-align: middle;

	&::before {
		display: block;
		font-size: inherit;
		line-height: 1;
	}
}

.online,
.active {
	--MI-statusColor: var(--MI_THEME-success);
}

.away {
	--MI-statusColor: var(--MI_THEME-warn);
}

.busy,
.doNotDisturb {
	--MI-statusColor: var(--MI_THEME-error);
}

.plain {
	--MI-statusGradient: none;

	color: var(--MI-statusForeground, var(--MI_THEME-fgOnAccent));
	background: var(--MI-statusColor);
	background-image: var(--MI-statusGradient);

	&.online,
	&.active {
		--MI-statusColor: var(--MI-statusOnline, var(--MI_THEME-success));
		--MI-statusGradient: linear-gradient(var(--MI-statusOnlineStart), var(--MI-statusOnlineEnd));
	}

	&.away {
		--MI-statusColor: var(--MI-statusAway, var(--MI_THEME-fg));
		--MI-statusGradient: linear-gradient(var(--MI-statusAwayStart), var(--MI-statusAwayEnd));
	}

	&.busy,
	&.doNotDisturb {
		--MI-statusColor: var(--MI-statusBusy, var(--MI_THEME-error));
		--MI-statusGradient: linear-gradient(var(--MI-statusBusyStart), var(--MI-statusBusyEnd));
	}

	&.invisible {
		--MI-statusColor: var(--MI-statusInvisible, var(--MI_THEME-warn));
		--MI-statusGradient: linear-gradient(140deg, var(--MI-statusInvisibleStart), var(--MI-statusInvisibleEnd));
	}

	> .glyph {
		font-size: 70cqi;
	}

	&.online > .glyph {
		visibility: hidden;
	}

	&.active > .glyph {
		font-size: 25cqi;
	}

	&.away,
	&.busy,
	&.invisible,
	&.doNotDisturb {
		> .glyph {
			width: 100%;
			height: 100%;

			&::before {
				content: '';
				width: 100%;
				height: 100%;
				background: currentColor;
			}
		}
	}

	&.away > .glyph::before {
		clip-path: polygon(45% 20%, 54% 20%, 54% 47%, 78% 47%, 78% 56%, 45% 56%);
	}

	&.busy > .glyph::before {
		clip-path: inset(45% 25% 45% 25% round 1cqi);
	}

	&.invisible > .glyph::before {
		clip-path: polygon(25% 34%, 75% 34%, 75% 43%, 25% 43%, 25% 55%, 75% 55%, 75% 64%, 25% 64%);
	}

	&.doNotDisturb {
		// Keep the ring's interior opaque when this icon overlaps an avatar.
		background: var(--MI-statusForeground);

		> .glyph::before {
			border-radius: 50%;
			background: var(--MI-statusGradient);
			mask-image:
				linear-gradient(45deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%),
				radial-gradient(circle closest-side, transparent 75%, currentColor 77%);
		}
	}

	&.offline,
	&.unknown {
		color: var(--MI_THEME-panel);
	}
}
</style>
