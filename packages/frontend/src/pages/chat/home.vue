<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :tabs="headerTabs" :swipable="true">
	<template v-if="$i.policies.chatAvailability === 'available'" #header-actions>
		<MkButton primary gradate rounded @click="start"><i class="ti ti-plus"></i> {{ i18n.ts.startChat }}</MkButton>
	</template>
	<MkPolkadots v-if="tab === 'home'" accented :height="200" style="margin-bottom: -200px;"/>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<XHome v-if="tab === 'home'"/>
		<XInvitations v-else-if="tab === 'invitations'"/>
		<XJoiningRooms v-else-if="tab === 'joiningRooms'"/>
		<XOwnedRooms v-else-if="tab === 'ownedRooms'"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import XHome from './home.home.vue';
import XInvitations from './home.invitations.vue';
import XJoiningRooms from './home.joiningRooms.vue';
import XOwnedRooms from './home.ownedRooms.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkPolkadots from '@/components/MkPolkadots.vue';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

const $i = ensureSignin();
const router = useRouter();
const tab = ref('home');

function start(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts._chat.individualChat,
		caption: i18n.ts._chat.individualChat_description,
		icon: 'ti ti-user',
		action: () => { startUser(); },
	}, { type: 'divider' }, {
		type: 'parent',
		text: i18n.ts._chat.roomChat,
		caption: i18n.ts._chat.roomChat_description,
		icon: 'ti ti-users-group',
		children: [{
			text: i18n.ts._chat.createRoom,
			icon: 'ti ti-plus',
			action: () => { createRoom(); },
		}],
	}], ev.currentTarget ?? ev.target);
}

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push('/chat/user/:userId', {
			params: {
				userId: user.id,
			},
		});
	});
}

async function createRoom() {
	const { canceled, result } = await os.inputText({
		title: i18n.ts.name,
		minLength: 1,
	});
	if (canceled) return;

	const room = await misskeyApi('chat/rooms/create', {
		name: result,
	});

	router.push('/chat/room/:roomId', {
		params: {
			roomId: room.id,
		},
	});
}

const headerTabs = computed(() => [{
	key: 'home',
	title: i18n.ts._chat.home,
	icon: 'ti ti-home',
}, {
	key: 'invitations',
	title: i18n.ts._chat.invitations,
	icon: 'ti ti-ticket',
}, {
	key: 'joiningRooms',
	title: i18n.ts._chat.joiningRooms,
	icon: 'ti ti-users-group',
}, {
	key: 'ownedRooms',
	title: i18n.ts._chat.yourRooms,
	icon: 'ti ti-settings',
}]);

definePage(() => ({
	title: i18n.ts.chat,
	icon: 'ti ti-message-dots',
}));
</script>

<style lang="scss" module>
</style>
