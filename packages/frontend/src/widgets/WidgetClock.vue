<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :naked="widgetProps.transparent" :showHeader="false" data-testid="mkw-clock">
	<div
		:class="[$style.root, {
			[$style.small]: widgetProps.size === 'small',
			[$style.medium]: widgetProps.size === 'medium',
			[$style.large]: widgetProps.size === 'large',
			[$style.rectangular]: ['linear', 'digital', 'words'].includes(widgetProps.design),
		}]"
	>
		<MkAnalogClock
			:class="$style.clock"
			:design="widgetProps.design"
			:thickness="widgetProps.thickness"
			:offset="tzOffset"
		/>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkAnalogClock from '@/components/MkAnalogClock.vue';
import { timezones } from '@/utility/timezones.js';
import { i18n } from '@/i18n.js';

const name = 'clock';

const widgetPropsDef = {
	design: {
		type: 'radio',
		label: i18n.ts._widgetOptions._clock.design,
		default: 'linear' as const,
		options: [{
			value: 'hud' as const,
			label: i18n.ts._widgetOptions._clock.hud,
		}, {
			value: 'orbit' as const,
			label: i18n.ts._widgetOptions._clock.orbit,
		}, {
			value: 'satellite' as const,
			label: i18n.ts._widgetOptions._clock.satellite,
		}, {
			value: 'linear' as const,
			label: i18n.ts._widgetOptions._clock.linear,
		}, {
			value: 'digital' as const,
			label: i18n.ts._widgetOptions._clock.digital,
		}, {
			value: 'words' as const,
			label: i18n.ts._widgetOptions._clock.words,
		}],
	},
	transparent: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.transparent,
		default: false,
	},
	size: {
		type: 'radio',
		hidden: values => values.design !== 'orbit' && values.design !== 'satellite' && values.design !== 'hud',
		label: i18n.ts._widgetOptions._clock.size,
		default: 'medium',
		options: [{
			value: 'small' as const,
			label: i18n.ts.small,
		}, {
			value: 'medium' as const,
			label: i18n.ts.medium,
		}, {
			value: 'large' as const,
			label: i18n.ts.large,
		}],
	},
	thickness: {
		type: 'radio',
		hidden: values => values.design !== 'orbit' && values.design !== 'satellite',
		label: i18n.ts._widgetOptions._clock.thickness,
		default: 0.2,
		options: [{
			value: 0.1 as const,
			label: i18n.ts._widgetOptions._clock.thicknessThin,
		}, {
			value: 0.2 as const,
			label: i18n.ts._widgetOptions._clock.thicknessMedium,
		}, {
			value: 0.3 as const,
			label: i18n.ts._widgetOptions._clock.thicknessThick,
		}],
	},
	timezone: {
		type: 'enum',
		label: i18n.ts._widgetOptions._clock.timezone,
		default: null,
		enum: [...timezones.map((tz) => ({
			label: tz.name,
			value: tz.name.toLowerCase(),
		})), {
			label: i18n.ts.auto,
			value: null,
		}],
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

watch(() => widgetProps.design, design => {
	if (!widgetPropsDef.design.options.some(option => option.value === design)) {
		widgetProps.design = widgetPropsDef.design.default;
	}
}, { immediate: true, flush: 'sync' });

const tzOffset = computed(() => widgetProps.timezone === null
	? 0 - new Date().getTimezoneOffset()
	: timezones.find((tz) => tz.name.toLowerCase() === widgetProps.timezone)?.offset ?? 0);

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	padding: var(--MI-cardPadding, 18px);

	&.small {
		--MI-clock-size: 120px;
	}

	&.medium {
		--MI-clock-size: 190px;
	}

	&.large {
		--MI-clock-size: 250px;
	}

	&.rectangular > .clock {
		width: 100%;
	}

	&:not(.rectangular) > .clock {
		height: var(--MI-clock-size);
	}
}

.clock {
	margin: auto;
}
</style>
