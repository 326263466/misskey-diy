<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 1200px;">
		<div class="_gaps_m">
			<section class="_panel _gaps" :class="$style.navigation" :aria-label="i18n.ts._benefits.adminTitle">
				<div :class="$style.heading">
					<div class="_gaps_s">
						<h2>{{ i18n.ts._benefits.adminTitle }}</h2>
						<p :class="$style.description">{{ i18n.ts._benefits.adminDescription }}</p>
					</div>
					<span :class="$style.benefit" :aria-label="`${i18n.ts._benefits.benefitType}: ${i18n.ts._benefits.checkinCard}`"><i class="ti ti-ticket" aria-hidden="true"></i> {{ i18n.ts._benefits.checkinCard }}</span>
				</div>
				<div :class="$style.methods" role="group" :aria-label="i18n.ts._benefits.distributionMethod">
					<button type="button" class="_button" :class="[$style.method, { [$style.selected]: method === 'direct' }]" :aria-pressed="method === 'direct'" :aria-label="i18n.ts._benefits.directGrant" :aria-describedby="directDescriptionId" :disabled="busy" @click="selectMethod('direct')"><i class="ti ti-user-plus" aria-hidden="true"></i><span class="_gaps_s"><strong>{{ i18n.ts._benefits.directGrant }}</strong><span :id="directDescriptionId" :class="$style.description">{{ i18n.ts._benefits.directGrantDescription }}</span></span></button>
					<button type="button" class="_button" :class="[$style.method, { [$style.selected]: method === 'codes' }]" :aria-pressed="method === 'codes'" :aria-label="i18n.ts._benefits.redemptionCodes" :aria-describedby="codesDescriptionId" :disabled="busy" @click="selectMethod('codes')"><i class="ti ti-qrcode" aria-hidden="true"></i><span class="_gaps_s"><strong>{{ i18n.ts._benefits.redemptionCodes }}</strong><span :id="codesDescriptionId" :class="$style.description">{{ i18n.ts._benefits.redemptionDescription }}</span></span></button>
				</div>
			</section>
			<AdminCheckin v-show="method === 'direct'" embedded @busy="directBusy = $event"/>
			<AdminBenefitCodes v-if="codesOpened" v-show="method === 'codes'" @busy="codesBusy = $event"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref, useId } from 'vue';
import AdminCheckin from './checkin.vue';
import AdminBenefitCodes from './benefits.codes.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const method = ref<'direct' | 'codes'>('direct');
const directDescriptionId = useId();
const codesDescriptionId = useId();
const codesOpened = ref(false);
const directBusy = ref(false);
const codesBusy = ref(false);
const busy = computed(() => directBusy.value || codesBusy.value);

function selectMethod(value: 'direct' | 'codes') {
	if (busy.value) return;
	if (value === 'codes') codesOpened.value = true;
	method.value = value;
}

definePage(() => ({ title: i18n.ts._benefits.adminTitle, icon: 'ti ti-gift' }));
</script>

<style lang="scss" module>
.navigation { padding: calc(var(--MI-margin) * 1.5); }
.heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--MI-margin); }
.heading h2 { margin: 0; font-size: 1.15em; }
.description { margin: 0; font-size: .85em; line-height: 1.7; color: var(--MI_THEME-fgTransparentWeak); }
.benefit { display: inline-flex; align-items: center; gap: var(--MI-marginHalf); padding: var(--MI-marginHalf) var(--MI-margin); border-radius: var(--MI-radius); background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-weight: bold; font-size: .85em; }
.methods { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--MI-marginHalf); }
.method {
	display: flex; align-items: flex-start; gap: var(--MI-margin); padding: var(--MI-margin); text-align: left; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius);
	> i { margin-top: .1em; font-size: 1.25em; }
	&:hover:not(:disabled) { background: var(--MI_THEME-buttonHoverBg); }
	&.selected { border-color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}
@media (max-width: 500px) {
	.navigation { padding: var(--MI-margin); }
	.methods { grid-template-columns: minmax(0, 1fr); }
}
</style>
