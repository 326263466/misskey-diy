<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
	<div class="_gaps_s">
		<XFolder v-if="matchQuery([i18n.ts._role._options.rateLimitFactor, 'rateLimitFactor'])" v-model:policyMeta="policyMetaModel.rateLimitFactor" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.rateLimitFactor }}</template>
			<template #valueText>{{ Math.floor(valuesModel.rateLimitFactor * 100) }}%</template>
			<template #default="{ disabled }">
				<MkRange v-model="valuesModel.rateLimitFactor" :disabled="disabled" :min="0.3" :max="3" :step="0.1" :textConverter="(v) => `${Math.round(v * 100)}%`">
					<template #caption>{{ i18n.ts._role._options.descriptionOfRateLimitFactor }}</template>
				</MkRange>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.gtlAvailable, 'gtlAvailable'])" v-model:policyMeta="policyMetaModel.gtlAvailable" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.gtlAvailable }}</template>
			<template #valueText>{{ valuesModel.gtlAvailable ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.gtlAvailable" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.ltlAvailable, 'ltlAvailable'])" v-model:policyMeta="policyMetaModel.ltlAvailable" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.ltlAvailable }}</template>
			<template #valueText>{{ valuesModel.ltlAvailable ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.ltlAvailable" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canPublicNote, 'canPublicNote'])" v-model:policyMeta="policyMetaModel.canPublicNote" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canPublicNote }}</template>
			<template #valueText>{{ valuesModel.canPublicNote ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canPublicNote" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.chatAvailability, 'chatAvailability'])" v-model:policyMeta="policyMetaModel.chatAvailability" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.chatAvailability }}</template>
			<template #valueText>{{ valuesModel.chatAvailability === 'available' ? i18n.ts.yes : valuesModel.chatAvailability === 'readonly' ? i18n.ts.readonly : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSelect
					v-model="valuesModel.chatAvailability"
					:disabled="disabled"
					:items="[
						{ label: i18n.ts.enabled, value: 'available' },
						{ label: i18n.ts.readonly, value: 'readonly' },
						{ label: i18n.ts.disabled, value: 'unavailable' },
					]"
				>
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSelect>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.mentionMax, 'mentionLimit'])" v-model:policyMeta="policyMetaModel.mentionLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.mentionMax }}</template>
			<template #valueText>{{ valuesModel.mentionLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.mentionLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canInvite, 'canInvite'])" v-model:policyMeta="policyMetaModel.canInvite" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canInvite }}</template>
			<template #valueText>{{ valuesModel.canInvite ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canInvite" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.inviteLimit, 'inviteLimit'])" v-model:policyMeta="policyMetaModel.inviteLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.inviteLimit }}</template>
			<template #valueText>{{ valuesModel.inviteLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.inviteLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.inviteLimitCycle, 'inviteLimitCycle'])" v-model:policyMeta="policyMetaModel.inviteLimitCycle" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.inviteLimitCycle }}</template>
			<template #valueText>{{ valuesModel.inviteLimitCycle + i18n.ts._time.minute }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.inviteLimitCycle" type="number" :disabled="disabled">
					<template #suffix>{{ i18n.ts._time.minute }}</template>
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.inviteExpirationTime, 'inviteExpirationTime'])" v-model:policyMeta="policyMetaModel.inviteExpirationTime" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.inviteExpirationTime }}</template>
			<template #valueText>{{ valuesModel.inviteExpirationTime + i18n.ts._time.minute }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.inviteExpirationTime" type="number" :disabled="disabled">
					<template #suffix>{{ i18n.ts._time.minute }}</template>
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canManageAvatarDecorations, 'canManageAvatarDecorations'])" v-model:policyMeta="policyMetaModel.canManageAvatarDecorations" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canManageAvatarDecorations }}</template>
			<template #valueText>{{ valuesModel.canManageAvatarDecorations ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canManageAvatarDecorations" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canManageCustomEmojis, 'canManageCustomEmojis'])" v-model:policyMeta="policyMetaModel.canManageCustomEmojis" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canManageCustomEmojis }}</template>
			<template #valueText>{{ valuesModel.canManageCustomEmojis ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canManageCustomEmojis" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.searchableContent, ...searchOptions.flatMap(option => [option.label, option.key])])" v-model:policyMeta="searchPolicyMeta" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.searchableContent }}</template>
			<template #valueText>{{ searchOptions.filter(option => selectedSearchPolicies.includes(option.key)).map(option => option.label).join(' / ') || i18n.ts.disabled }}</template>
			<template #default="{ disabled }">
				<div class="_gaps_s">
					<div :class="$style.searchOptions" role="group" :aria-label="i18n.ts._role._options.searchableContent">
						<label v-for="option in searchOptions" :key="option.key" :class="$style.searchOption">
							<input v-model="selectedSearchPolicies" type="checkbox" :value="option.key" :disabled="disabled">
							<span>{{ option.label }}</span>
						</label>
					</div>
					<div class="_caption">{{ i18n.ts._role._options.searchableContentDescription }}</div>
					<div v-if="!isBaseRole && searchPrioritiesMixed" class="_caption">{{ i18n.ts._role._options.searchableContentMixedPriority }}</div>
				</div>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canUseTranslator, 'canUseTranslator'])" v-model:policyMeta="policyMetaModel.canUseTranslator" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canUseTranslator }}</template>
			<template #valueText>{{ valuesModel.canUseTranslator ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canUseTranslator" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canCreateChannel, 'canCreateChannel'])" v-model:policyMeta="policyMetaModel.canCreateChannel" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canCreateChannel }}</template>
			<template #valueText>{{ valuesModel.canCreateChannel ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canCreateChannel" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.driveCapacity, 'driveCapacityMb'])" v-model:policyMeta="policyMetaModel.driveCapacityMb" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.driveCapacity }}</template>
			<template #valueText>{{ valuesModel.driveCapacityMb }}MB</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.driveCapacityMb" type="number" :disabled="disabled">
					<template #suffix>MB</template>
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.maxFileSize, 'maxFileSizeMb'])" v-model:policyMeta="policyMetaModel.maxFileSizeMb" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.maxFileSize }}</template>
			<template #valueText>{{ valuesModel.maxFileSizeMb }}MB</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.maxFileSizeMb" type="number" :disabled="disabled">
					<template #suffix>MB</template>
					<template #caption>
						<div>{{ i18n.tsx._role._options.maxFileSize_caption2({ max: `${Math.floor(instance.maxFileSize / (1024 * 1024))}MB` }) }}</div>
						<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> {{ i18n.ts._role._options.maxFileSize_caption }}</div>
					</template>
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.uploadableFileTypes, 'uploadableFileTypes'])" v-model:policyMeta="policyMetaModel.uploadableFileTypes" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.uploadableFileTypes }}</template>
			<template #valueText>...</template>
			<template #default="{ disabled }">
				<MkTextarea :modelValue="valuesModel.uploadableFileTypes.join('\n')" :disabled="disabled" @update:modelValue="v => valuesModel.uploadableFileTypes = v.split('\n')">
					<template #caption>
						<div>{{ i18n.ts._role._options.uploadableFileTypes_caption }}</div>
						<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> {{ i18n.tsx._role._options.uploadableFileTypes_caption2({ x: 'application/octet-stream' }) }}</div>
					</template>
				</MkTextarea>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.alwaysMarkNsfw, 'alwaysMarkNsfw'])" v-model:policyMeta="policyMetaModel.alwaysMarkNsfw" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.alwaysMarkNsfw }}</template>
			<template #valueText>{{ valuesModel.alwaysMarkNsfw ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.alwaysMarkNsfw" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canUpdateBioMedia, 'canUpdateBioMedia'])" v-model:policyMeta="policyMetaModel.canUpdateBioMedia" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canUpdateBioMedia }}</template>
			<template #valueText>{{ valuesModel.canUpdateBioMedia ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canUpdateBioMedia" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.pinMax, 'pinLimit'])" v-model:policyMeta="policyMetaModel.pinLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.pinMax }}</template>
			<template #valueText>{{ valuesModel.pinLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.pinLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.antennaMax, 'antennaLimit'])" v-model:policyMeta="policyMetaModel.antennaLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.antennaMax }}</template>
			<template #valueText>{{ valuesModel.antennaLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.antennaLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.wordMuteMax, 'wordMuteLimit'])" v-model:policyMeta="policyMetaModel.wordMuteLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.wordMuteMax }}</template>
			<template #valueText>{{ valuesModel.wordMuteLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.wordMuteLimit" type="number" :disabled="disabled">
					<template #suffix>{{ i18n.ts._role.characters }}</template>
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.webhookMax, 'webhookLimit'])" v-model:policyMeta="policyMetaModel.webhookLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.webhookMax }}</template>
			<template #valueText>{{ valuesModel.webhookLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.webhookLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.clipMax, 'clipLimit'])" v-model:policyMeta="policyMetaModel.clipLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.clipMax }}</template>
			<template #valueText>{{ valuesModel.clipLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.clipLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.noteEachClipsMax, 'noteEachClipsLimit'])" v-model:policyMeta="policyMetaModel.noteEachClipsLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.noteEachClipsMax }}</template>
			<template #valueText>{{ valuesModel.noteEachClipsLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.noteEachClipsLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.userListMax, 'userListLimit'])" v-model:policyMeta="policyMetaModel.userListLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.userListMax }}</template>
			<template #valueText>{{ valuesModel.userListLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.userListLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.userEachUserListsMax, 'userEachUserListsLimit'])" v-model:policyMeta="policyMetaModel.userEachUserListsLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.userEachUserListsMax }}</template>
			<template #valueText>{{ valuesModel.userEachUserListsLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.userEachUserListsLimit" type="number" :disabled="disabled">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canHideAds, 'canHideAds'])" v-model:policyMeta="policyMetaModel.canHideAds" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canHideAds }}</template>
			<template #valueText>{{ valuesModel.canHideAds ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canHideAds" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.avatarDecorationLimit, 'avatarDecorationLimit'])" v-model:policyMeta="policyMetaModel.avatarDecorationLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.avatarDecorationLimit }}</template>
			<template #valueText>{{ valuesModel.avatarDecorationLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="avatarDecorationLimit" type="number" :disabled="disabled" :min="0" :max="16" @update:modelValue="updateAvatarDecorationLimit">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canImportAntennas, 'canImportAntennas'])" v-model:policyMeta="policyMetaModel.canImportAntennas" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canImportAntennas }}</template>
			<template #valueText>{{ valuesModel.canImportAntennas ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canImportAntennas" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canImportBlocking, 'canImportBlocking'])" v-model:policyMeta="policyMetaModel.canImportBlocking" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canImportBlocking }}</template>
			<template #valueText>{{ valuesModel.canImportBlocking ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canImportBlocking" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canImportFollowing, 'canImportFollowing'])" v-model:policyMeta="policyMetaModel.canImportFollowing" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canImportFollowing }}</template>
			<template #valueText>{{ valuesModel.canImportFollowing ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canImportFollowing" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canImportMuting, 'canImportMuting'])" v-model:policyMeta="policyMetaModel.canImportMuting" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canImportMuting }}</template>
			<template #valueText>{{ valuesModel.canImportMuting ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canImportMuting" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.canImportUserLists, 'canImportUserList'])" v-model:policyMeta="policyMetaModel.canImportUserLists" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.canImportUserLists }}</template>
			<template #valueText>{{ valuesModel.canImportUserLists ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.canImportUserLists" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.noteDraftLimit, 'noteDraftLimit'])" v-model:policyMeta="policyMetaModel.noteDraftLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.noteDraftLimit }}</template>
			<template #valueText>{{ valuesModel.noteDraftLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.noteDraftLimit" type="number" :disabled="disabled" :min="0">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.scheduledNoteLimit, 'scheduledNoteLimit'])" v-model:policyMeta="policyMetaModel.scheduledNoteLimit" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.scheduledNoteLimit }}</template>
			<template #valueText>{{ valuesModel.scheduledNoteLimit }}</template>
			<template #default="{ disabled }">
				<MkInput v-model="valuesModel.scheduledNoteLimit" type="number" :disabled="disabled" :min="0">
				</MkInput>
			</template>
		</XFolder>

		<XFolder v-if="matchQuery([i18n.ts._role._options.watermarkAvailable, 'watermarkAvailable'])" v-model:policyMeta="policyMetaModel.watermarkAvailable" :isBaseRole="isBaseRole" :readonly="readonly">
			<template #label>{{ i18n.ts._role._options.watermarkAvailable }}</template>
			<template #valueText>{{ valuesModel.watermarkAvailable ? i18n.ts.yes : i18n.ts.no }}</template>
			<template #default="{ disabled }">
				<MkSwitch v-model="valuesModel.watermarkAvailable" :disabled="disabled">
					<template #label>{{ i18n.ts.enable }}</template>
				</MkSwitch>
			</template>
		</XFolder>
	</div>
</template>

<script lang="ts">
import * as Misskey from 'misskey-js';
import { instance } from '@/instance.js';

export type PolicyMeta = {
	useDefault: boolean;
	priority: number;
};

type PolicyMetaRecord = {
	[K in keyof Misskey.entities.RolePolicies]: PolicyMeta;
};
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { i18n } from '@/i18n.js';
import XFolder from './roles.policy-editor.folder.vue';

import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkRange from '@/components/MkRange.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';

const props = defineProps<{
	isBaseRole: boolean;
	rolePolicies: Misskey.entities.RolePolicies;
	policiesMeta?: PolicyMetaRecord;
	roleQuery?: string;
	readonly?: boolean;
}>();

const emit = defineEmits<{
	(event: 'update:rolePolicies', value: Misskey.entities.RolePolicies): void;
	(event: 'update:policiesMeta', value: PolicyMetaRecord): void;
}>();

const valuesModel = ref(props.rolePolicies);
watch(valuesModel, (newVal) => {
	emit('update:rolePolicies', newVal);
}, { deep: true });
watch(() => props.rolePolicies, () => {
	valuesModel.value = props.rolePolicies;
}, { deep: true });

function setPolicyMeta(incoming: Partial<PolicyMetaRecord> | undefined): PolicyMetaRecord {
	const meta: PolicyMetaRecord = {} as PolicyMetaRecord;
	for (const ROLE_POLICY of Misskey.rolePolicies) {
		meta[ROLE_POLICY] = incoming?.[ROLE_POLICY] ?? {
			useDefault: true,
			priority: 0,
		};
	}
	return meta;
}

const policyMetaModel = ref(setPolicyMeta(props.policiesMeta));
watch(policyMetaModel, (newVal) => {
	emit('update:policiesMeta', newVal);
}, { deep: true });
watch(() => props.policiesMeta, () => {
	policyMetaModel.value = setPolicyMeta(props.policiesMeta);
}, { deep: true });

const searchOptions = [
	{ key: 'canSearchArticles', label: i18n.ts._article.article },
	{ key: 'canSearchNotes', label: i18n.ts.notes },
	{ key: 'canSearchUsers', label: i18n.ts.users },
] as const;
type SearchPolicy = typeof searchOptions[number]['key'];

function searchAllowed(key: SearchPolicy): boolean {
	return !props.isBaseRole && policyMetaModel.value[key].useDefault ? instance.policies[key] : valuesModel.value[key];
}

const selectedSearchPolicies = computed<SearchPolicy[]>({
	get: () => searchOptions.filter(option => searchAllowed(option.key)).map(option => option.key),
	set: (selected) => {
		for (const { key } of searchOptions) {
			const allowed = selected.includes(key);
			if (allowed === searchAllowed(key)) continue;
			valuesModel.value[key] = allowed;
			if (!props.isBaseRole) policyMetaModel.value[key].useDefault = false;
		}
	},
});

const searchPolicyMeta = computed<PolicyMeta>({
	get: () => ({
		useDefault: searchOptions.every(option => policyMetaModel.value[option.key].useDefault),
		priority: Math.max(...searchOptions.map(option => policyMetaModel.value[option.key].priority)),
	}),
	set: (value) => {
		const previous = searchPolicyMeta.value;
		for (const { key } of searchOptions) {
			const meta = policyMetaModel.value[key];
			if (value.useDefault !== previous.useDefault) {
				valuesModel.value[key] = searchAllowed(key);
				meta.useDefault = value.useDefault;
			}
			if (value.priority !== previous.priority) meta.priority = value.priority;
		}
	},
});

const searchPrioritiesMixed = computed(() => new Set(searchOptions.map(option => policyMetaModel.value[option.key].priority)).size > 1);

function matchQuery(keywords: string[]): boolean {
	if (props.roleQuery == null || props.roleQuery.trim().length === 0) return true;
	return keywords.some(keyword => keyword.toLowerCase().includes(props.roleQuery!.toLowerCase()));
}

const avatarDecorationLimit = computed({
	get: () => Math.min(16, Math.max(0, Number(valuesModel.value.avatarDecorationLimit ?? 0))),
	set: (value) => {
		valuesModel.value.avatarDecorationLimit = Math.min(Number(value), 16);
	},
});

function updateAvatarDecorationLimit(value: string | number) {
	avatarDecorationLimit.value = Number(value);
}
</script>

<style lang="scss" module>
.searchOptions {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.searchOption {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 6px;
	cursor: pointer;

	&:has(input:checked) {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
		border-color: var(--MI_THEME-accent);
	}

	&:has(input:disabled) {
		opacity: 0.6;
		cursor: not-allowed;
	}

	&:focus-within {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}

	input {
		margin: 0;
		accent-color: var(--MI_THEME-accent);
	}
}
</style>
