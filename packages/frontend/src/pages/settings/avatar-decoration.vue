<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/avatar-decoration" :label="i18n.ts.avatarDecorations" :keywords="['avatar', 'icon', 'decoration']" icon="ti ti-sparkles">
	<div>
		<div v-if="!loading" class="_gaps">
			<MkInfo>{{ i18n.tsx._profile.avatarDecorationMax({ max: $i.policies.avatarDecorationLimit }) }} ({{ i18n.tsx.remainingN({ n: $i.policies.avatarDecorationLimit - $i.avatarDecorations.length }) }})</MkInfo>

			<MkAvatar :class="$style.avatar" :user="$i" forceShowDecoration/>

			<div v-if="$i.avatarDecorations.length > 0" v-panel :class="$style.current" class="_gaps_s">
				<div>{{ i18n.ts.inUse }}</div>

				<div :class="$style.decorations">
					<XDecoration
						v-for="(avatarDecoration, i) in $i.avatarDecorations"
						:decoration="avatarDecorations.find(d => d.id === avatarDecoration.id) ?? { id: '', url: '', name: '?', roleIdsThatCanBeUsedThisDecoration: [] }"
						:angle="avatarDecoration.angle"
						:flipH="avatarDecoration.flipH"
						:offsetX="avatarDecoration.offsetX"
						:offsetY="avatarDecoration.offsetY"
						:active="true"
						@click="openAttachedDecoration(i)"
					/>
				</div>

				<MkButton danger @click="detachAllDecorations">{{ i18n.ts.detachAll }}</MkButton>
			</div>
			<MkFoldableSection v-for="category in Object.keys(groupedDecorations)" :key="category" :expanded="true">
				<template #header>{{ category || i18n.ts.other }}</template>
				<div :class="$style.decorations">
					<XDecoration
						v-for="avatarDecoration in groupedDecorations[category]"
						:key="avatarDecoration.id"
						:decoration="avatarDecoration"
						@click="openDecoration(avatarDecoration)"
					/>
				</div>
			</MkFoldableSection>
		</div>
		<div v-else>
			<MkLoading/>
		</div>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, defineAsyncComponent, computed } from 'vue';
import * as Misskey from 'misskey-js';
import XDecoration from './avatar-decoration.decoration.vue';
import XDialog from './avatar-decoration.dialog.vue';
import MkButton from '@/components/MkButton.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import MkInfo from '@/components/MkInfo.vue';
import { definePage } from '@/page.js';
import { groupAvatarDecorations } from '@/utility/group-avatar-decorations.js';
import { enqueueProfileSave } from '@/utility/profile-save.js';

const $i = ensureSignin();

const loading = ref(true);
const avatarDecorations = ref<Misskey.entities.GetAvatarDecorationsResponse>([]);
const groupedDecorations = computed(() => groupAvatarDecorations(avatarDecorations.value));

misskeyApi('get-avatar-decorations').then(_avatarDecorations => {
	avatarDecorations.value = _avatarDecorations;
	loading.value = false;
});

function openAttachedDecoration(index: number) {
	openDecoration(avatarDecorations.value.find(d => d.id === $i.avatarDecorations[index].id) ?? { id: '', url: '', name: '?', roleIdsThatCanBeUsedThisDecoration: [] }, index);
}

async function openDecoration(avatarDecoration: {
	id: string;
	url: string;
	name: string;
	roleIdsThatCanBeUsedThisDecoration: string[];
}, index?: number) {
	const originalDecorations = JSON.stringify($i.avatarDecorations);

	function canEditAttachedDecoration(): boolean {
		if (JSON.stringify($i.avatarDecorations) === originalDecorations) return true;
		// The dialog index may now identify a different decoration. Ask for a fresh edit.
		void os.alert({ type: 'error', title: i18n.ts.error, text: i18n.ts.tryAgain });
		return false;
	}

	const { dispose } = os.popup(XDialog, {
		decoration: avatarDecoration,
		usingIndex: index ?? null,
	}, {
		'attach': async (payload) => {
			await enqueueProfileSave(async () => {
				const decoration = {
					id: avatarDecoration.id,
					url: avatarDecoration.url,
					angle: payload.angle,
					flipH: payload.flipH,
					offsetX: payload.offsetX,
					offsetY: payload.offsetY,
				};
				const update = [...$i.avatarDecorations, decoration];
				const user = await os.apiWithDialog('i/update', {
					avatarDecorations: update,
				});
				updateCurrentAccountPartial({ avatarDecorations: user.avatarDecorations });
			});
		},
		'update': async (payload) => {
			await enqueueProfileSave(async () => {
				if (!canEditAttachedDecoration()) return;
				const decoration = {
					id: avatarDecoration.id,
					url: avatarDecoration.url,
					angle: payload.angle,
					flipH: payload.flipH,
					offsetX: payload.offsetX,
					offsetY: payload.offsetY,
				};
				const update = [...$i.avatarDecorations];
				update[index!] = decoration;
				const user = await os.apiWithDialog('i/update', {
					avatarDecorations: update,
				});
				updateCurrentAccountPartial({ avatarDecorations: user.avatarDecorations });
			});
		},
		'detach': async () => {
			await enqueueProfileSave(async () => {
				if (!canEditAttachedDecoration()) return;
				const update = [...$i.avatarDecorations];
				update.splice(index!, 1);
				const user = await os.apiWithDialog('i/update', {
					avatarDecorations: update,
				});
				updateCurrentAccountPartial({ avatarDecorations: user.avatarDecorations });
			});
		},
		closed: () => dispose(),
	});
}

function detachAllDecorations() {
	os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	}).then(async ({ canceled }) => {
		if (canceled) return;
		await enqueueProfileSave(async () => {
			const user = await os.apiWithDialog('i/update', {
				avatarDecorations: [],
			});
			updateCurrentAccountPartial({ avatarDecorations: user.avatarDecorations });
		});
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.avatarDecorations,
	icon: 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.avatar {
	display: inline-block;
	width: 72px;
	height: 72px;
	margin: 16px auto;
}

.current {
	padding: 16px;
	border-radius: var(--MI-radius);
}

.decorations {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	grid-gap: 12px;
}
</style>
