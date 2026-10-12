<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-if="invitations.length > 0" class="_gaps_s">
		<MkFolder v-for="invitation in invitations" :key="invitation.id" :defaultOpen="true">
			<template #icon><i class="ti ti-users-group"></i></template>
			<template #label><Mfm :text="invitation.room.name" :plain="true" :nowrap="true" :author="invitation.room.owner"/></template>
			<template #suffix><MkTime :time="invitation.createdAt"/></template>
			<template #footer>
				<div class="_buttons">
					<MkButton primary @click="join(invitation)"><i class="ti ti-plus"></i> {{ i18n.ts._chat.join }}</MkButton>
					<MkButton danger @click="ignore(invitation)"><i class="ti ti-x"></i> {{ i18n.ts._chat.ignore }}</MkButton>
				</div>
			</template>

				<div :class="$style.invitationBody">
					<div class="_gaps_s">
						<div style="color: var(--MI_THEME-fgTransparentWeak);"><Mfm v-if="invitation.room.description" :text="invitation.room.description" :plain="true" :author="invitation.room.owner"/><template v-else>{{ i18n.ts.noDescription }}</template></div>
					</div>
				</div>
		</MkFolder>
	</div>
	<MkResult v-if="!fetching && invitations.length === 0" type="empty" :text="i18n.ts._chat.noInvitations" page/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';
import MkFolder from '@/components/MkFolder.vue';

const router = useRouter();

const fetching = ref(true);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);

async function fetchInvitations() {
	fetching.value = true;

	const res = await misskeyApi('chat/rooms/invitations/inbox');

	invitations.value = res;

	fetching.value = false;
}

async function join(invitation: Misskey.entities.ChatRoomInvitation) {
	await misskeyApi('chat/rooms/join', {
		roomId: invitation.room.id,
	});

	router.push('/chat/room/:roomId', {
		params: {
			roomId: invitation.room.id,
		},
	});
}

async function ignore(invitation: Misskey.entities.ChatRoomInvitation) {
	await misskeyApi('chat/rooms/invitations/ignore', {
		roomId: invitation.room.id,
	});

	invitations.value = invitations.value.filter(i => i.id !== invitation.id);
}

onMounted(() => {
	fetchInvitations();
});
</script>

<style lang="scss" module>
.invitationBody {
	display: flex;
	align-items: center;
}
</style>
