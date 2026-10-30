<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<Transition :name="prefer.s.animation ? '_transition_zoom' : ''" mode="out-in">
		<MkLoading v-if="fetching"/>
		<div v-else :class="$style.root" class="_panel">
			<MkA v-for="user in moderators" :key="user.id" :class="$style.user" :to="`/admin/user/${user.id}`" behavior="window">
				<MkAvatar :user="user" :class="$style.avatar" indicator/>
				<span :class="$style.identity">
					<MkUserName :user="user" :nowrap="true" :class="$style.name"/>
					<span :class="$style.role">{{ isAdministrator(user) ? i18n.ts.administrator : i18n.ts.moderator }}</span>
				</span>
			</MkA>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';

const moderators = ref<Misskey.entities.UserDetailed[] | null>(null);
const fetching = ref(true);

function isAdministrator(user: Misskey.entities.UserDetailed): boolean {
	return 'isAdmin' in user && user.isAdmin === true;
}

onMounted(async () => {
	moderators.value = await misskeyApi('admin/show-users', {
		sort: '+lastActiveDate',
		state: 'adminOrModerator',
		limit: 30,
	});

	fetching.value = false;
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 12px;
	padding: 10px var(--MI-cardPadding) 12px;
}

.user {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	max-width: 240px;
	padding: 4px 6px;
	border-radius: var(--MI-radius);
	transition: background-color 0.15s ease;

	&:is(:hover, :focus-visible) {
		background: var(--MI_THEME-panelHighlight);
		text-decoration: none;

		.name {
			color: var(--MI_THEME-accent);
		}
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.avatar {
	flex: 0 0 auto;
	width: 30px;
	height: 30px;
}

.identity {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.name {
	min-width: 0;
	font-size: 1em;
}

.role {
	flex: 0 0 auto;
	padding: 2px 6px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fgTransparentWeak);
	border-radius: 999px;
	font-size: 0.9em;
	line-height: 1.3;
}

@media (prefers-reduced-motion: reduce) {
	.user {
		transition: none;
	}
}
</style>
