<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="adminTableMode ? [] : headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div :class="{ _adminPanel: adminTableMode }">
			<div v-if="adminTableMode" class="_adminToolbar">
				<MkButton small primary @click="add"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.add }}</MkButton>
			</div>
			<MkLoading v-if="loading" :page="!adminTableMode"/>
			<MkError v-else-if="error" :page="!adminTableMode" @retry="load"/>
			<MkResult v-else-if="Object.keys(groupedDecorations).length === 0" type="empty" :page="!adminTableMode"/>
			<MkPaginationBar v-else v-slot="{ items }" v-model:page="page" :items="orderedDecorations" :disabled="loading" :class="{ _adminPanelInset: adminTableMode }">
				<MkFoldableSection v-for="(decorations, category) in groupAvatarDecorations(items)" :key="category" :expanded="true">
					<template #header>{{ category || i18n.ts.uncategorized }}</template>
					<div :class="$style.decorations">
						<button
							v-for="avatarDecoration in decorations"
							:key="avatarDecoration.id"
							v-panel
							type="button"
							class="_button"
							:class="$style.decoration"
							:aria-label="`${i18n.ts.edit}: ${avatarDecoration.name}`"
							@click="edit(avatarDecoration)"
						>
							<div :class="$style.decorationName"><MkCondensedLine :minScale="0.5">{{ avatarDecoration.name }}</MkCondensedLine></div>
							<MkAvatar style="width: 60px; height: 60px;" :user="$i" :decorations="[{ url: avatarDecoration.url, scale: avatarDecoration.scale }]" forceShowDecoration/>
							<template v-if="adminTableMode">
								<p v-if="avatarDecoration.description" :class="$style.description" :title="avatarDecoration.description">{{ avatarDecoration.description }}</p>
								<div :class="$style.details">
									<span>{{ i18n.ts._avatarDecoration.scale }}: {{ Math.round(avatarDecoration.scale * 100) }}%</span>
									<span>{{ i18n.ts.availableRoles }}: {{ avatarDecoration.roleIdsThatCanBeUsedThisDecoration.length || i18n.ts.all }}</span>
								</div>
							</template>
						</button>
					</div>
				</MkFoldableSection>
			</MkPaginationBar>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, inject, onBeforeUnmount, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkButton from '@/components/MkButton.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import { groupAvatarDecorations } from '@/utility/group-avatar-decorations.js';

const $i = ensureSignin();
const adminTableMode = inject('adminTableMode', false);

const avatarDecorations = shallowRef<Misskey.entities.AdminAvatarDecorationsListResponse>([]);
const groupedDecorations = computed(() => groupAvatarDecorations(avatarDecorations.value));
const orderedDecorations = computed(() => Object.values(groupedDecorations.value).flat());
const page = ref(1);
const loading = ref(false);
const error = ref(false);
let disposed = false;

async function load() {
	if (loading.value || disposed) return;
	loading.value = true;
	error.value = false;
	try {
		const result = await misskeyApi('admin/avatar-decorations/list');
		if (disposed) return;
		avatarDecorations.value = result;
		page.value = 1;
	} catch {
		if (!disposed) error.value = true;
	} finally {
		if (!disposed) loading.value = false;
	}
}

void load();
onBeforeUnmount(() => { disposed = true; });

// 编辑窗口不是模态的，同时只允许打开一个，避免多个窗口改同一列表。
let editorOpen = false;

async function openEditor(props: { avatarDecoration?: Misskey.entities.AdminAvatarDecorationsListResponse[number] }, done: (result: { deleted?: boolean; updated?: any; created?: any }) => void) {
	if (editorOpen) return;
	editorOpen = true;
	try {
		const { dispose } = await os.popupAsyncWithDialog(import('./avatar-decoration-edit-dialog.vue').then(x => x.default), {
			...props,
			categories: Object.keys(groupedDecorations.value),
		}, {
			done: result => {
				if (!disposed) done(result);
			},
			closed: () => {
				dispose();
				editorOpen = false;
			},
		});
	} catch {
		editorOpen = false;
	}
}

function add() {
	void openEditor({}, result => {
		if (result.created) {
			avatarDecorations.value = [result.created, ...avatarDecorations.value];
		}
	});
}

function edit(avatarDecoration: Misskey.entities.AdminAvatarDecorationsListResponse[number]) {
	void openEditor({ avatarDecoration }, result => {
		if (result.updated) {
			avatarDecorations.value = avatarDecorations.value.map(item => item.id === avatarDecoration.id ? { ...item, ...result.updated } : item);
		} else if (result.deleted) {
			avatarDecorations.value = avatarDecorations.value.filter(x => x.id !== avatarDecoration.id);
		}
	});
}

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.add,
	handler: add,
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.avatarDecorations,
	icon: 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.decorations {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr));
	grid-gap: 12px;
}

.decoration {
	cursor: pointer;
	width: 100%;
	box-sizing: border-box;
	padding: 16px 16px 28px 16px;
	border-radius: var(--MI-adminRadius, 8px);
	text-align: center;
	font-size: 1em;
	overflow: clip;
	contain: content;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.decorationName {
	position: relative;
	z-index: 10;
	font-weight: bold;
	margin-bottom: 20px;
}

.description {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	margin: 16px 0 0;
	overflow: hidden;
	overflow-wrap: anywhere;
	color: var(--MI_THEME-fgTransparentWeak);
}

.details {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-top: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow-wrap: anywhere;
}
</style>
