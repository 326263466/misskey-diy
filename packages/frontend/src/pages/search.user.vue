<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div class="_gaps">
		<MkInput v-model="searchQuery" :large="true" :autofocus="true" type="search" @enter.prevent="search">
			<template #label>{{ i18n.ts.search }}</template>
			<template #prefix><i class="ti ti-search"></i></template>
		</MkInput>
		<MkRadios
			v-if="instance.federation !== 'none'"
			v-model="searchOrigin"
			:options="[
				{ value: 'combined', label: i18n.ts.all },
				{ value: 'local', label: i18n.ts.local },
				{ value: 'remote', label: i18n.ts.remote },
			]"
		>
		</MkRadios>
		<MkButton large primary gradate rounded :disabled="!searchQuery.trim()" @click="search">{{ i18n.ts.search }}</MkButton>
	</div>

	<MkFoldableSection v-if="paginator">
		<template #header>{{ i18n.ts.searchResult }}</template>
		<MkUserList :key="`searchUsers:${key}`" :paginator="paginator"/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { markRaw, ref, shallowRef, watch } from 'vue';
import type { Endpoints } from 'misskey-js';
import MkUserList from '@/components/MkUserList.vue';
import MkInput from '@/components/MkInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';

const props = withDefaults(defineProps<{
	query?: string,
	origin?: Endpoints['users/search']['req']['origin'],
}>(), {
	query: '',
	origin: 'combined',
});

const router = useRouter();
const emit = defineEmits<{
	(ev: 'search', query: string): void;
}>();

const key = ref(0);
const paginator = shallowRef<Paginator<'users/search'> | null>(null);

const searchQuery = ref(props.query);
const submittedQuery = ref('');
const searchOrigin = ref(props.origin);

async function search() {
	const query = searchQuery.value.toString().trim();

	if (query === '') return;

	//#region AP lookup
	if (query.startsWith('https://') && !query.includes(' ')) {
		const confirm = await os.confirm({
			type: 'info',
			text: i18n.ts.lookupConfirm,
		});
		if (!confirm.canceled) {
			const promise = misskeyApi('ap/show', {
				uri: query,
			});

			os.promiseDialog(promise, null, null, i18n.ts.fetchingAsApObject);

			const res = await promise;

			if (res.type === 'User') {
				router.push('/@:acct/:page?', {
					params: {
						acct: `${res.object.username}@${res.object.host}`,
					},
				});
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			} else if (res.type === 'Note') {
				router.push('/notes/:noteId/:initialTab?', {
					params: {
						noteId: res.object.id,
					},
				});
			}

			return;
		}
	}
	//#endregion

	if (query.length > 1 && !query.includes(' ')) {
		if (query.startsWith('@')) {
			const confirm = await os.confirm({
				type: 'info',
				text: i18n.ts.lookupConfirm,
			});
			if (!confirm.canceled) {
				router.pushByPath(`/${query}`);
				return;
			}
		}

		if (query.startsWith('#')) {
			const confirm = await os.confirm({
				type: 'info',
				text: i18n.ts.openTagPageConfirm,
			});
			if (!confirm.canceled) {
				router.push('/user-tags/:tag', {
					params: {
						tag: query.substring(1),
					},
				});
				return;
			}
		}
	}

	showResults(query);
}

function showResults(query: string) {
	query = query.trim();
	if (!query) return;

	submittedQuery.value = query;
	paginator.value = markRaw(new Paginator('users/search', {
		limit: 10,
		offsetMode: true,
		params: {
			query: query,
			origin: instance.federation === 'none' ? 'local' : searchOrigin.value,
		},
	}));

	key.value++;
	emit('search', query);
}

watch(() => props.query, query => {
	if (query.trim() === submittedQuery.value) return;
	searchQuery.value = query;
	if (query.trim()) {
		showResults(query);
	} else {
		submittedQuery.value = '';
		paginator.value = null;
	}
}, { immediate: true });

watch(searchOrigin, () => {
	if (submittedQuery.value) showResults(submittedQuery.value);
});
</script>
