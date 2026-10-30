<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<tr v-if="table">
	<td class="_adminTableMain _selectableAtomic _monospace">{{ invite.code }}</td>
	<td>
		<span v-if="invite.used" class="_adminTableStatus">{{ i18n.ts.used }}</span>
		<span v-else-if="isExpired" class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-error)">{{ i18n.ts.expired }}</span>
		<span v-else class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-success)">{{ i18n.ts.unused }}</span>
	</td>
	<td v-if="moderator">
		<div v-if="invite.createdBy" class="_adminTableIdentity">
			<MkAvatar :user="invite.createdBy" class="_adminTableAvatar" link preview/>
			<div>
				<MkUserName :user="invite.createdBy" :nowrap="false"/>
				<div class="_adminTableSecondary _monospace">{{ invite.createdBy.id }}</div>
			</div>
		</div>
		<span v-else>{{ i18n.ts.system }}</span>
	</td>
	<td>
		<div v-if="invite.used && invite.usedBy" class="_adminTableIdentity">
			<MkAvatar :user="invite.usedBy" class="_adminTableAvatar" link preview/>
			<div>
				<MkUserName :user="invite.usedBy" :nowrap="false"/>
				<div v-if="moderator" class="_adminTableSecondary _monospace">{{ invite.usedBy.id }}</div>
			</div>
		</div>
		<span v-else-if="invite.used">{{ i18n.ts.unknown }} ({{ i18n.ts.waitingForMailAuth }})</span>
		<span v-else class="_adminTableSecondary">{{ i18n.ts.unused }}</span>
	</td>
	<td v-if="moderator"><MkTime :time="invite.createdAt" mode="absolute"/></td>
	<td>
		<MkTime v-if="invite.expiresAt && !invite.used" :time="invite.expiresAt" mode="absolute"/>
		<span v-else-if="!invite.used" class="_adminTableSecondary">{{ i18n.ts.noExpirationDate }}</span>
		<span v-else class="_adminTableSecondary">{{ i18n.ts.none }}</span>
	</td>
	<td>
		<MkTime v-if="invite.usedAt" :time="invite.usedAt" mode="absolute"/>
		<span v-else class="_adminTableSecondary">{{ i18n.ts.none }}</span>
	</td>
	<td class="_adminTableActions">
		<div class="_adminTableTools">
			<button v-if="!invite.used && !isExpired" type="button" class="_button _textButton" @click="copyInviteCode()"><i class="ti ti-copy" aria-hidden="true"></i> {{ i18n.ts.copy }}</button>
			<button v-if="!invite.used || moderator" type="button" class="_button _textButton" style="color: var(--MI_THEME-error)" @click="deleteCode()"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.delete }}</button>
		</div>
	</td>
</tr>
<MkFolder v-else>
	<template #label>{{ invite.code }}</template>
	<template #suffix>
		<span v-if="invite.used">{{ i18n.ts.used }}</span>
		<span v-else-if="isExpired" style="color: var(--MI_THEME-error)">{{ i18n.ts.expired }}</span>
		<span v-else style="color: var(--MI_THEME-success)">{{ i18n.ts.unused }}</span>
	</template>
	<template #footer>
		<div class="_buttons">
			<MkButton v-if="!invite.used && !isExpired" primary rounded @click="copyInviteCode()"><i class="ti ti-copy"></i> {{ i18n.ts.copy }}</MkButton>
			<MkButton v-if="!invite.used || moderator" danger rounded @click="deleteCode()"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
		</div>
	</template>

	<div :class="$style.root">
		<div :class="$style.items">
			<div>
				<div :class="$style.label">{{ i18n.ts.invitationCode }}</div>
				<div class="_selectableAtomic">{{ invite.code }}</div>
			</div>
			<div v-if="moderator">
				<div :class="$style.label">{{ i18n.ts.inviteCodeCreator }}</div>
				<div v-if="invite.createdBy" :class="$style.user">
					<MkAvatar :user="invite.createdBy" :class="$style.avatar" link preview/>
					<MkUserName :user="invite.createdBy" :nowrap="false"/>
					<div v-if="moderator">({{ invite.createdBy.id }})</div>
				</div>
				<div v-else>{{ i18n.ts.system }}</div>
			</div>
			<div v-if="invite.used">
				<div :class="$style.label">{{ i18n.ts.registeredUserUsingInviteCode }}</div>
				<div v-if="invite.usedBy" :class="$style.user">
					<MkAvatar :user="invite.usedBy" :class="$style.avatar" link preview/>
					<MkUserName :user="invite.usedBy" :nowrap="false"/>
					<div v-if="moderator">({{ invite.usedBy.id }})</div>
				</div>
				<div v-else>{{ i18n.ts.unknown }} ({{ i18n.ts.waitingForMailAuth }})</div>
			</div>
			<div v-if="invite.expiresAt && !invite.used">
				<div :class="$style.label">{{ i18n.ts.expirationDate }}</div>
				<div><MkTime :time="invite.expiresAt" mode="absolute"/></div>
			</div>
			<div v-if="invite.usedAt">
				<div :class="$style.label">{{ i18n.ts.inviteCodeUsedAt }}</div>
				<div><MkTime :time="invite.usedAt" mode="absolute"/></div>
			</div>
			<div v-if="moderator">
				<div :class="$style.label">{{ i18n.ts.createdAt }}</div>
				<div><MkTime :time="invite.createdAt" mode="absolute"/></div>
			</div>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = defineProps<{
	invite: Misskey.entities.InviteCode;
	moderator?: boolean;
	table?: boolean;
}>();

const emits = defineEmits<{
	(event: 'deleted', value: string): void;
}>();

const isExpired = computed(() => {
	return props.invite.expiresAt && new Date(props.invite.expiresAt) < new Date();
});

function deleteCode() {
	// 失败提示由 apiWithDialog 处理，失败时保留列表项
	os.apiWithDialog('invite/delete', {
		inviteId: props.invite.id,
	}).then(() => {
		os.toast(i18n.ts.deleteSucceeded, 'success');
		emits('deleted', props.invite.id);
	}, () => {});
}

function copyInviteCode() {
	copyToClipboard(props.invite.code);
}
</script>

<style lang="scss" module>
.root {
	text-align: left;
}

.items {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
	grid-gap: 12px;
}

.label {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;
	color: var(--MI_THEME-fgTransparentWeak);
}

.user {
	display: flex;
	align-items: center;
	gap: 8px;
}

.avatar {
	--height: 24px;
	width: var(--height);
	height: var(--height);
}
</style>
