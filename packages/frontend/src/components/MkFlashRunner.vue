<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- 小程序运行区：进入时运行，缓存停用时中止，再次进入时重新开始。 -->
<div :key="runKey" :class="$style.root">
	<MkAsUi v-if="root" :component="root" :components="components"/>
	<MkLoading v-else/>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { utils } from '@syuilo/aiscript';
import { compareVersions } from 'compare-versions';
import { url } from '@@/js/config.js';
import type { Ref } from 'vue';
import type { Interpreter } from '@syuilo/aiscript';
import type { AsUiComponent, AsUiRoot } from '@/aiscript/ui.js';
import MkAsUi from '@/components/MkAsUi.vue';
import { registerAsUiLib } from '@/aiscript/ui.js';
import { aiScriptReadline, createAiScriptEnv } from '@/aiscript/api.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';

const props = defineProps<{
	flash: Misskey.entities.Flash;
}>();

const aiscript = shallowRef<Interpreter | null>(null);
const root = ref<AsUiRoot>();
const components = ref<Ref<AsUiComponent>[]>([]);
// 重新开始时重建运行区，清掉上一次运行留下的输入状态。
const runKey = ref(0);
const pageActive = inject(DI.pageActive, ref(true));
const activated = ref(true);
const canRun = computed(() => pageActive.value && activated.value);
let mounted = false;
let runGeneration = 0;

function stop() {
	runGeneration++;
	aiscript.value?.abort();
	aiscript.value = null;
}

function getIsLegacy(version: string | null): boolean {
	if (version == null) return true;
	try {
		return compareVersions(version, '1.0.0') < 0;
	} catch {
		return false;
	}
}

async function run() {
	if (!mounted || !canRun.value) return;
	stop();
	const generation = runGeneration;
	const isCurrentRun = () => mounted && canRun.value && generation === runGeneration;
	root.value = undefined;
	runKey.value++;
	const flash = props.flash;

	const isLegacy = getIsLegacy(utils.getLangVersion(flash.script));
	let runtime: typeof import('@syuilo/aiscript');
	try {
		runtime = (isLegacy ? (await import('@syuilo/aiscript-0-19-0')) : await import('@syuilo/aiscript')) as typeof import('@syuilo/aiscript');
	} catch (err) {
		if (isCurrentRun()) {
			os.alert({ type: 'error', title: i18n.ts._aiscript.internalError, text: String(err) });
		}
		return;
	}
	if (!isCurrentRun()) return;
	const { Interpreter, Parser, values } = runtime;

	components.value = [];
	const environment = createAiScriptEnv({ storageKey: 'flash:' + flash.id });
	// abort 不阻止直接调用原生函数，旧运行的宿主 API 也必须检查活动状态和代次。
	for (const value of Object.values(environment)) {
		if (value.type !== 'fn' || !value.native) continue;
		const native = value.native;
		value.native = (args, opts) => isCurrentRun() ? native(args, opts) : values.NULL;
	}

	const interpreter = new Interpreter({
		...environment,
		...registerAsUiLib(components.value, (_root) => {
			if (isCurrentRun()) root.value = _root.value;
		}),
		THIS_ID: values.STR(flash.id),
		THIS_URL: values.STR(`${url}/play/${flash.id}`),
	}, {
		in: q => isCurrentRun() ? aiScriptReadline(q) : Promise.resolve(''),
		out: () => {
			// nop
		},
		err: (err) => {
			if (!isCurrentRun()) return;
			os.alert({
				type: 'error',
				title: i18n.ts._aiscript.runtimeError,
				text: String(err),
			});
		},
		log: () => {
			// nop
		},
	});

	aiscript.value = interpreter;

	let ast;
	try {
		ast = new Parser().parse(flash.script);
	} catch (err) {
		if (!isCurrentRun()) return;
		os.alert({
			type: 'error',
			title: i18n.ts._aiscript.syntaxError,
			text: String(err),
		});
		return;
	}
	try {
		await interpreter.exec(ast);
	} catch (err: any) {
		if (!isCurrentRun()) return;
		os.alert({
			type: 'error',
			title: i18n.ts._aiscript.internalError,
			text: String(err),
		});
	}
}

onMounted(() => {
	mounted = true;
	void run();
});
onActivated(() => { activated.value = true; });
onDeactivated(() => { activated.value = false; });
watch(canRun, active => {
	if (active) void run();
	else stop();
}, { flush: 'sync' });
onBeforeUnmount(() => {
	mounted = false;
	stop();
});

defineExpose({ run });
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	justify-content: center;
	min-height: 220px;
	overflow-x: auto;
}
</style>
