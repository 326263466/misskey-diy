<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<SearchMarker path="/admin/relays" :label="i18n.ts.relays" :keywords="['relays']" icon="ti ti-planet">
			<div class="_gaps">
				<div class="_adminPanel">
					<div class="_adminToolbar">
						<MkButton small primary @click="addRelay"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.addRelay }}</MkButton>
					</div>
					<MkPaginationBar v-slot="{ items }" :items="relays">
						<div class="_adminTableContainer">
							<table class="_adminTable">
								<thead>
									<tr>
										<th scope="col">{{ i18n.ts.inboxUrl }}</th>
										<th scope="col">{{ i18n.ts.state }}</th>
										<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
									</tr>
								</thead>
								<tbody>
									<tr v-if="relays.length === 0">
										<td colspan="3" class="_adminTableEmpty">{{ i18n.ts.nothing }}</td>
									</tr>
									<tr v-for="relay in items" :key="relay.inbox">
										<td class="_adminTableMain _monospace _selectable">{{ relay.inbox }}</td>
										<td>
											<span class="_adminTableStatus" :style="{ '--admin-statusColor': relay.status === 'accepted' ? 'var(--MI_THEME-success)' : relay.status === 'rejected' ? 'var(--MI_THEME-error)' : 'var(--MI_THEME-fgTransparentWeak)' }">
												<i v-if="relay.status === 'accepted'" class="ti ti-check" aria-hidden="true"></i>
												<i v-else-if="relay.status === 'rejected'" class="ti ti-ban" aria-hidden="true"></i>
												<i v-else class="ti ti-clock" aria-hidden="true"></i>
												{{ i18n.ts._relayStatus[relay.status] }}
											</span>
										</td>
										<td class="_adminTableActions">
											<button type="button" class="_button _textButton" style="color: var(--MI_THEME-error)" @click="remove(relay.inbox)"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.remove }}</button>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</MkPaginationBar>
				</div>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const relays = ref<Misskey.entities.AdminRelaysListResponse>([]);

async function addRelay() {
	const { canceled, result: inbox } = await os.inputText({
		title: i18n.ts.addRelay,
		type: 'url',
		placeholder: i18n.ts.inboxUrl,
	});
	if (canceled || inbox == null) return;
	// 失败提示由 apiWithDialog 处理
	os.apiWithDialog('admin/relays/add', {
		inbox,
	}).then(() => {
		os.toast(i18n.ts.added, 'success');
		refresh();
	}, () => {});
}

function remove(inbox: string) {
	// 失败提示由 apiWithDialog 处理
	os.apiWithDialog('admin/relays/remove', {
		inbox,
	}).then(() => {
		os.toast(i18n.ts.removed, 'success');
		refresh();
	}, () => {});
}

function refresh() {
	misskeyApi('admin/relays/list').then(relayList => {
		relays.value = relayList;
	});
}

refresh();

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.relays,
	icon: 'ti ti-planet',
}));
</script>
