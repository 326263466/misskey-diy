<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" contentCard :actions="adminTableMode ? [] : headerActions" :tabs="headerTabs" :loading="tab === 'remote' ? remotePaginator.fetching.value : paginator.fetching.value">
	<template v-if="adminTableMode" #header-actions>
		<div class="_adminToolbar _adminHeaderToolbar">
			<template v-if="tab === 'local'">
				<MkInput v-model="query" type="search" autocapitalize="off" class="_adminToolbarField">
					<template #prefix><i class="ti ti-search"></i></template>
					<template #label>{{ i18n.ts.search }}</template>
				</MkInput>
				<MkSwitch v-model="selectMode">
					<template #label>{{ i18n.ts._customEmojisManager.selectMode }}</template>
				</MkSwitch>
			</template>
			<template v-else>
				<MkInput v-model="queryRemote" type="search" autocapitalize="off" class="_adminToolbarField">
					<template #prefix><i class="ti ti-search"></i></template>
					<template #label>{{ i18n.ts.search }}</template>
				</MkInput>
				<MkInput v-model="host" type="search" class="_adminToolbarField">
					<template #label>{{ i18n.ts.host }}</template>
				</MkInput>
			</template>
			<div class="_adminToolbarActions">
				<MkButton small primary @click="add"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.addEmoji }}</MkButton>
				<MkButton small @click="menu"><i class="ti ti-dots" aria-hidden="true"></i> {{ i18n.ts.more }}</MkButton>
			</div>
		</div>
	</template>
	<div class="_pageBody">
		<div class="ogwlenmc">
			<div v-if="tab === 'local'" class="local" :class="{ _adminPanel: adminTableMode }">
				<div v-if="!adminTableMode">
					<MkInput v-model="query" type="search" autocapitalize="off">
						<template #prefix><i class="ti ti-search"></i></template>
						<template #label>{{ i18n.ts.search }}</template>
					</MkInput>
					<MkSwitch v-model="selectMode" style="margin: 8px 0;">
						<template #label>{{ i18n.ts._customEmojisManager.selectMode }}</template>
					</MkSwitch>
				</div>
				<div v-if="selectMode" class="_buttons" :class="{ _adminPanelHeader: adminTableMode }">
					<MkButton inline @click="selectAll">{{ i18n.ts._customEmojisManager.selectAll }}</MkButton>
					<MkButton inline @click="setCategoryBulk">{{ i18n.ts._customEmojisManager.setCategory }}</MkButton>
					<MkButton inline @click="setTagBulk">{{ i18n.ts._customEmojisManager.setAliases }}</MkButton>
					<MkButton inline @click="addTagBulk">{{ i18n.ts._customEmojisManager.addAliases }}</MkButton>
					<MkButton inline @click="removeTagBulk">{{ i18n.ts._customEmojisManager.removeAliases }}</MkButton>
					<MkButton inline @click="setLicenseBulk">{{ i18n.ts._customEmojisManager.setLicense }}</MkButton>
					<MkButton inline danger @click="delBulk">{{ i18n.ts.delete }}</MkButton>
				</div>
				<MkPagination ref="emojisPaginationComponent" :paginator="paginator" pageEmpty :class="{ _adminPanelInset: adminTableMode }">
					<template #empty="{ fetching }"><MkResult type="empty" :text="i18n.ts.noCustomEmojis" page :loading="fetching"/></template>
					<template #default="{items}">
						<div class="ldhfsamy">
							<button v-for="emoji in items" :key="emoji.id" type="button" class="emoji _panel _button" :class="{ selected: selectedEmojis.includes(emoji.id) }" :aria-pressed="selectMode ? selectedEmojis.includes(emoji.id) : undefined" @click="selectMode ? toggleSelect(emoji) : edit(emoji)">
								<img :src="emoji.url" class="img" :alt="emoji.name"/>
								<div class="body">
									<div class="name _monospace">{{ emoji.name }}</div>
									<div class="info">{{ emoji.category || (adminTableMode ? i18n.ts.uncategorized : '') }}</div>
									<template v-if="adminTableMode">
										<div :class="$style.metadata" :title="`${i18n.ts._customEmojisManager._gridCommon.aliases}: ${emoji.aliases.join(', ') || i18n.ts.none}`">{{ i18n.ts._customEmojisManager._gridCommon.aliases }}: {{ emoji.aliases.join(', ') || i18n.ts.none }}</div>
										<div :class="$style.metadata" :title="`${i18n.ts.license}: ${emoji.license || i18n.ts.notSet}`">{{ i18n.ts.license }}: {{ emoji.license || i18n.ts.notSet }}</div>
										<div :class="$style.flags">
											<span v-if="emoji.isSensitive" :class="[$style.flag, $style.sensitive]">{{ i18n.ts.sensitive }}</span>
											<span v-if="emoji.localOnly" :class="$style.flag">{{ i18n.ts.localOnly }}</span>
											<span v-if="!emoji.isSensitive && !emoji.localOnly" :class="$style.metadata">{{ i18n.ts.normal }}</span>
										</div>
									</template>
								</div>
							</button>
						</div>
					</template>
				</MkPagination>
			</div>

			<div v-else-if="tab === 'remote'" class="remote" :class="{ _adminPanel: adminTableMode }">
				<FormSplit v-if="!adminTableMode">
					<MkInput v-model="queryRemote" type="search" autocapitalize="off">
						<template #prefix><i class="ti ti-search"></i></template>
						<template #label>{{ i18n.ts.search }}</template>
					</MkInput>
					<MkInput v-model="host" type="search">
						<template #label>{{ i18n.ts.host }}</template>
					</MkInput>
				</FormSplit>
				<MkPagination :paginator="remotePaginator" pageEmpty :class="{ _adminPanelInset: adminTableMode }">
					<template #empty="{ fetching }"><MkResult type="empty" :text="i18n.ts.noCustomEmojis" page :loading="fetching"/></template>
					<template #default="{items}">
						<div class="ldhfsamy">
							<button v-for="emoji in items" :key="emoji.id" type="button" class="emoji _panel _button" aria-haspopup="menu" @click="remoteMenu(emoji as RemoteEmoji, $event)">
								<img :src="getProxiedImageUrl(emoji.url, 'emoji')" class="img" :alt="emoji.name"/>
								<div class="body">
									<div class="name _monospace">{{ emoji.name }}</div>
									<div class="info">{{ emoji.host }}</div>
									<template v-if="adminTableMode">
										<div :class="$style.metadata">{{ emoji.category || i18n.ts.uncategorized }}</div>
										<div :class="$style.metadata" :title="`${i18n.ts._customEmojisManager._gridCommon.aliases}: ${emoji.aliases.join(', ') || i18n.ts.none}`">{{ i18n.ts._customEmojisManager._gridCommon.aliases }}: {{ emoji.aliases.join(', ') || i18n.ts.none }}</div>
										<div :class="$style.metadata" :title="`${i18n.ts.license}: ${emoji.license || i18n.ts.notSet}`">{{ i18n.ts.license }}: {{ emoji.license || i18n.ts.notSet }}</div>
									</template>
								</div>
							</button>
						</div>
					</template>
				</MkPagination>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, inject, markRaw, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkRemoteEmojiEditDialog from '@/components/MkRemoteEmojiEditDialog.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSplit from '@/components/form/split.vue';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { getProxiedImageUrl } from '@/utility/media-proxy.js';
import { i18n } from '@/i18n.js';
import { iAmAdmin } from '@/i.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';
import { useSearchQuery } from '@/composables/use-search-query.js';

const adminTableMode = inject('adminTableMode', false);
const tab = ref('local');
const query = ref<string | null>(null);
const queryRemote = ref<string | null>(null);
const host = ref<string | null>(null);
const localQuery = useSearchQuery(query);
const remoteQuery = useSearchQuery(queryRemote);
const remoteHost = useSearchQuery(host);
const selectMode = ref(false);
const selectedEmojis = ref<string[]>([]);

type RemoteEmoji = Misskey.entities.AdminEmojiListRemoteResponse[number] & { host: string };

const paginator = markRaw(new Paginator('admin/emoji/list', {
	limit: 30,
	computedParams: computed(() => ({
		query: localQuery.value || null,
	})),
}));

const remotePaginator = markRaw(new Paginator('admin/emoji/list-remote', {
	limit: 30,
	computedParams: computed(() => ({
		query: remoteQuery.value || null,
		host: remoteHost.value || null,
	})),
}));

const selectAll = () => {
	if (selectedEmojis.value.length > 0) {
		selectedEmojis.value = [];
	} else {
		selectedEmojis.value = paginator.items.value.map(item => item.id);
	}
};

const toggleSelect = (emoji: Misskey.entities.EmojiDetailed) => {
	if (selectedEmojis.value.includes(emoji.id)) {
		selectedEmojis.value = selectedEmojis.value.filter(x => x !== emoji.id);
	} else {
		selectedEmojis.value.push(emoji.id);
	}
};

const add = async () => {
	const { dispose } = await os.popupAsyncWithDialog(import('./emoji-edit-dialog.vue').then(x => x.default), {
	}, {
		done: result => {
			if (result.created) {
				const nowIso = (new Date()).toISOString();
				paginator.prepend({
					...result.created,
					createdAt: nowIso,
				});
			}
		},
		closed: () => dispose(),
	});
};

const edit = async (emoji: Misskey.entities.EmojiDetailed) => {
	const { dispose } = await os.popupAsyncWithDialog(import('./emoji-edit-dialog.vue').then(x => x.default), {
		emoji: emoji,
	}, {
		done: result => {
			if (result.updated) {
				paginator.updateItem(result.updated.id, (oldEmoji) => ({
					...oldEmoji,
					...result.updated,
				}));
			} else if (result.deleted) {
				paginator.removeItem(emoji.id);
			}
		},
		closed: () => dispose(),
	});
};

const detailRemoteEmoji = (emoji: {
	id: string,
	name: string,
	host: string,
	license: string | null,
	url: string
}) => {
	const { dispose } = os.popup(MkRemoteEmojiEditDialog, {
		emoji: emoji,
	}, {
		done: () => {
			dispose();
		},
		closed: () => {
			dispose();
		},
	});
};

const importEmoji = (emojiId: string) => {
	// 失败提示由 apiWithDialog 处理
	os.apiWithDialog('admin/emoji/copy', {
		emojiId: emojiId,
	}).then(() => {
		os.toast(i18n.ts.added, 'success');
	}, () => {});
};

const remoteMenu = (emoji: {
	id: string,
	name: string,
	host: string,
	license: string | null,
	url: string
}, ev: PointerEvent) => {
	os.popupMenu([{
		type: 'label',
		text: ':' + emoji.name + ':',
	}, {
		text: i18n.ts.details,
		icon: 'ti ti-info-circle',
		action: () => { detailRemoteEmoji(emoji); },
	}, {
		text: i18n.ts.import,
		icon: 'ti ti-plus',
		action: () => { importEmoji(emoji.id); },
	}], ev.currentTarget ?? ev.target);
};

const menu = (ev: PointerEvent) => {
	os.popupMenu([{
		icon: 'ti ti-download',
		text: i18n.ts.export,
		action: async () => {
			misskeyApi('export-custom-emojis', {
			})
				.then(() => {
					os.alert({
						type: 'info',
						text: i18n.ts.exportRequested,
					});
				}).catch((err) => {
					if (!isAccountSessionErrorHandled(err)) os.toast(err.message || i18n.ts.somethingHappened, 'error');
				});
		},
	}, ...(iAmAdmin ? [{
		icon: 'ti ti-upload',
		text: i18n.ts.import,
		action: async () => {
			const file = await selectFile({
				anchorElement: ev.currentTarget ?? ev.target,
				multiple: false,
			});
			misskeyApi('admin/emoji/import-zip', {
				fileId: file.id,
			})
				.then(() => {
					os.alert({
						type: 'info',
						text: i18n.ts.importRequested,
					});
				}).catch((err) => {
					if (!isAccountSessionErrorHandled(err)) os.toast(err.message || i18n.ts.somethingHappened, 'error');
				});
		},
	}] : [])], ev.currentTarget ?? ev.target);
};

const setCategoryBulk = async () => {
	const { canceled, result } = await os.inputText({
		title: i18n.ts.category,
	});
	if (canceled) return;
	await os.apiWithDialog('admin/emoji/set-category-bulk', {
		ids: selectedEmojis.value,
		category: result,
	});
	os.toast(i18n.ts.saved, 'success');
	paginator.reload();
};

const setLicenseBulk = async () => {
	const { canceled, result } = await os.inputText({
		title: i18n.ts.license,
	});
	if (canceled) return;
	await os.apiWithDialog('admin/emoji/set-license-bulk', {
		ids: selectedEmojis.value,
		license: result,
	});
	os.toast(i18n.ts.saved, 'success');
	paginator.reload();
};

const addTagBulk = async () => {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._customEmojisManager._gridCommon.aliases,
	});
	if (canceled || result == null) return;
	await os.apiWithDialog('admin/emoji/add-aliases-bulk', {
		ids: selectedEmojis.value,
		aliases: result.split(' '),
	});
	os.toast(i18n.ts.saved, 'success');
	paginator.reload();
};

const removeTagBulk = async () => {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._customEmojisManager._gridCommon.aliases,
	});
	if (canceled || result == null) return;
	await os.apiWithDialog('admin/emoji/remove-aliases-bulk', {
		ids: selectedEmojis.value,
		aliases: result.split(' '),
	});
	os.toast(i18n.ts.saved, 'success');
	paginator.reload();
};

const setTagBulk = async () => {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._customEmojisManager._gridCommon.aliases,
	});
	if (canceled || result == null) return;
	await os.apiWithDialog('admin/emoji/set-aliases-bulk', {
		ids: selectedEmojis.value,
		aliases: result.split(' '),
	});
	os.toast(i18n.ts.saved, 'success');
	paginator.reload();
};

const delBulk = async () => {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	});
	if (canceled) return;
	await os.apiWithDialog('admin/emoji/delete-bulk', {
		ids: selectedEmojis.value,
	});
	os.toast(i18n.ts.deleteSucceeded, 'success');
	paginator.reload();
};

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.addEmoji,
	handler: add,
}, {
	icon: 'ti ti-dots',
	text: i18n.ts.more,
	handler: menu,
}]);

const headerTabs = computed(() => [{
	key: 'local',
	title: i18n.ts.local,
}, {
	key: 'remote',
	title: i18n.ts.remote,
}]);

definePage(() => ({
	title: i18n.ts.customEmojis,
	icon: 'ti ti-icons',
}));
</script>

<style lang="scss" scoped>
.ogwlenmc {
	> .local {
		.empty {
			margin: var(--MI-margin);
		}

		.ldhfsamy {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
			grid-gap: 12px;
			margin: var(--MI-margin) 0;

			> .emoji {
				display: flex;
				align-items: center;
				padding: 11px;
				text-align: left;
				border: solid 1px var(--MI_THEME-panel);

				&:hover {
					border-color: var(--MI_THEME-inputBorderHover);
				}

				&.selected {
					border-color: var(--MI_THEME-accent);
				}

				> .img {
					width: 42px;
					height: 42px;
					object-fit: contain;
				}

				> .body {
					padding: 0 0 0 8px;
					white-space: nowrap;
					overflow: hidden;

					> .name {
						text-overflow: ellipsis;
						overflow: hidden;
					}

					> .info {
						color: var(--MI_THEME-fgTransparentWeak);
						text-overflow: ellipsis;
						overflow: hidden;
					}
				}
			}
		}
	}

	> .remote {
		.empty {
			margin: var(--MI-margin);
		}

		.ldhfsamy {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
			grid-gap: 12px;
			margin: var(--MI-margin) 0;

			> .emoji {
				display: flex;
				align-items: center;
				padding: 12px;
				text-align: left;

				&:hover {
					color: var(--MI_THEME-accent);

					> .body > .info {
						color: inherit;
					}
				}

				> .img {
					width: 32px;
					height: 32px;
					object-fit: contain;
				}

				> .body {
					padding: 0 0 0 8px;
					white-space: nowrap;
					overflow: hidden;

					> .name {
						text-overflow: ellipsis;
						overflow: hidden;
					}

					> .info {
						color: var(--MI_THEME-fgTransparentWeak);
						font-size: 90%;
						text-overflow: ellipsis;
						overflow: hidden;
					}
				}
			}
		}
	}

	// 后台面板内由面板控制内边距
	> ._adminPanel .ldhfsamy {
		margin: 0;
	}
}
</style>

<style lang="scss" module>
.metadata {
	margin-top: 3px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1em;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.flags {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 6px;
}

.flag {
	padding: 2px 5px;
	border-radius: calc(var(--MI-radius) / 4);
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.sensitive {
	color: var(--MI_THEME-warn);
}
</style>
