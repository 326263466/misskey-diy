<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div class="_gaps">
			<MkInput v-model="title">
				<template #label>{{ i18n.ts._play.title }}</template>
			</MkInput>
			<MkSelect v-model="visibility" :items="visibilityDef">
				<template #label>{{ i18n.ts.visibility }}</template>
				<template #caption>{{ i18n.ts._play.visibilityDescription }}</template>
			</MkSelect>
			<MkTextarea v-model="summary" :mfmAutocomplete="true" :mfmPreview="true">
				<template #label>{{ i18n.ts._play.summary }}</template>
			</MkTextarea>
			<MkButton primary @click="selectPreset">{{ i18n.ts.selectFromPresets }}<i class="ti ti-chevron-down"></i></MkButton>
			<MkCodeEditor v-model="script" lang="is">
				<template #label>{{ i18n.ts._play.script }}</template>
			</MkCodeEditor>
		</div>
	</div>
	<template #footer>
		<div :class="$style.footer">
			<div class="_pageFooter">
				<div class="_buttons">
					<MkButton primary @click="save"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
					<MkButton @click="show"><i class="ti ti-eye"></i> {{ i18n.ts.show }}</MkButton>
					<MkButton v-if="flash" danger @click="del"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
				</div>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { AISCRIPT_VERSION } from '@syuilo/aiscript';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkCodeEditor from '@/components/MkCodeEditor.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { useRouter } from '@/router.js';

const PRESET_DEFAULT = `/// @ ${AISCRIPT_VERSION}

var name = ""

Ui:render([
	Ui:C:textInput({
		label: "你的名字"
		onInput: @(v) { name = v }
	})
	Ui:C:button({
		text: "打招呼"
		onClick: @() {
			Mk:dialog(null, \`你好，{name}！\`)
		}
	})
])
`;

const PRESET_OMIKUJI = `/// @ ${AISCRIPT_VERSION}
// 每日运势：同一用户在同一天得到相同的结果

// 可能的结果
let choices = [
	"超级大吉"
	"大吉"
	"吉"
	"中吉"
	"小吉"
	"末吉"
	"凶"
	"大凶"
]

// 以“互动应用 ID + 用户 ID + 当天日期”作为随机数种子
let random = Math:gen_rng(\`{THIS_ID}{USER_ID}{Date:year()}{Date:month()}{Date:day()}\`)

// 随机选取一个结果
let chosen = choices[random(0, (choices.len - 1))]

// 结果文本
let result = \`你今天的运势是 **{chosen}**。\`

// 显示界面
Ui:render([
	Ui:C:container({
		align: 'center'
		children: [
			Ui:C:mfm({ text: result })
			Ui:C:postFormButton({
				text: "发布到帖子"
				rounded: true
				primary: true
				form: {
					text: \`{result}{Str:lf}{THIS_URL}\`
				}
			})
		]
	})
])
`;

const PRESET_SHUFFLE = `/// @ ${AISCRIPT_VERSION}
// 打乱文字顺序，可前后查看历史结果

let string = "意大利面"
let length = string.len

// 保存历史结果
var results = []

// 当前回看到第几条
var cursor = 0

@main() {
	if (cursor != 0) {
		results = results.slice(0, (cursor + 1))
		cursor = 0
	}

	let chars = []
	for (let i, length) {
		let r = Math:rnd(0, (length - 1))
		chars.push(string.pick(r))
	}
	let result = chars.join("")

	results.push(result)

	// 显示界面
	render(result)
}

@back() {
	cursor = cursor + 1
	let result = results[results.len - (cursor + 1)]
	render(result)
}

@forward() {
	cursor = cursor - 1
	let result = results[results.len - (cursor + 1)]
	render(result)
}

@render(result) {
	Ui:render([
		Ui:C:container({
			align: 'center'
			children: [
				Ui:C:mfm({ text: result })
				Ui:C:buttons({
					buttons: [{
						text: "←"
						disabled: !(results.len > 1 && (results.len - cursor) > 1)
						onClick: back
					}, {
						text: "→"
						disabled: !(results.len > 1 && cursor > 0)
						onClick: forward
					}, {
						text: "重新打乱"
						onClick: main
					}]
				})
				Ui:C:postFormButton({
					text: "发布到帖子"
					rounded: true
					primary: true
					form: {
						text: \`{result}{Str:lf}{THIS_URL}\`
					}
				})
			]
		})
	])
}

main()
`;

const PRESET_QUIZ = `/// @ ${AISCRIPT_VERSION}
let title = '地理知识测验'

let qas = [{
	q: '澳大利亚的首都是？'
	choices: ['悉尼', '堪培拉', '墨尔本']
	a: '堪培拉'
	aDescription: '悉尼是澳大利亚最大的城市，但首都是堪培拉。'
}, {
	q: '国土面积排名第二的国家是？'
	choices: ['加拿大', '美国', '中国']
	a: '加拿大'
	aDescription: '按国土总面积排序，前四位依次为俄罗斯、加拿大、美国和中国。'
}, {
	q: '以下哪个国家不是双重内陆国？'
	choices: ['列支敦士登', '乌兹别克斯坦', '莱索托']
	a: '莱索托'
	aDescription: '莱索托四周只与南非接壤，是内陆国，但不是双重内陆国。'
}, {
	q: '以下哪条运河没有船闸？'
	choices: ['基尔运河', '苏伊士运河', '巴拿马运河']
	a: '苏伊士运河'
	aDescription: '苏伊士运河两端水位基本相同，因此没有船闸。'
}]

let qaEls = [Ui:C:container({
	align: 'center'
	children: [
		Ui:C:text({
			size: 1.5
			bold: true
			text: title
		})
	]
})]

var qn = 0
each (let qa, qas) {
	qn += 1
	qa.id = Util:uuid()
	qaEls.push(Ui:C:container({
		align: 'center'
		bgColor: '#000'
		fgColor: '#fff'
		padding: 16
		rounded: true
		children: [
			Ui:C:text({
				text: \`Q{qn} {qa.q}\`
			})
			Ui:C:select({
				items: qa.choices.map(@(c) {{ text: c, value: c }})
				onChange: @(v) { qa.userAnswer = v }
			})
			Ui:C:container({
				children: []
			}, \`{qa.id}:a\`)
		]
	}, qa.id))
}

@finish() {
	var score = 0

	each (let qa, qas) {
		let correct = qa.userAnswer == qa.a
		if (correct) score += 1
		let el = Ui:get(\`{qa.id}:a\`)
		el.update({
			children: [
				Ui:C:text({
					size: 1.2
					bold: true
					color: if (correct) '#f00' else '#00f'
					text: if (correct) '🎉 回答正确' else '回答错误'
				})
				Ui:C:text({
					text: qa.aDescription
				})
			]
		})
	}

	let result = \`{title}：共 {qas.len} 题，答对 {score} 题。\`
	Ui:get('footer').update({
		children: [
			Ui:C:postFormButton({
				text: '分享结果'
				rounded: true
				primary: true
				form: {
					text: \`{result}{Str:lf}{THIS_URL}\`
				}
			})
		]
	})
}

qaEls.push(Ui:C:container({
	align: 'center'
	children: [
		Ui:C:button({
			text: '提交答案'
			primary: true
			rounded: true
			onClick: finish
		})
	]
}, 'footer'))

Ui:render(qaEls)
`;

const PRESET_TIMELINE = `/// @ ${AISCRIPT_VERSION}
// 调用 API 获取并显示本站时间线

@fetch() {
	Ui:render([
		Ui:C:container({
			align: 'center'
			children: [
				Ui:C:text({ text: "加载中…" })
			]
		})
	])

	// 获取时间线
	let notes = Mk:api("notes/local-timeline", {})

	// 为每条帖子生成界面元素
	let noteEls = []
	each (let note, notes) {
		// 未设置昵称的账号显示用户名
		let userName = if Core:type(note.user.name) == "str" note.user.name else note.user.username
		// 转发或只有媒体、投票而没有正文的帖子显示替代文字
		let noteText = if Core:type(note.text) == "str" note.text else "（转发，或仅包含媒体、投票的帖子）"

		let el = Ui:C:container({
			bgColor: "#444"
			fgColor: "#fff"
			padding: 10
			rounded: true
			children: [
				Ui:C:mfm({
					text: userName
					bold: true
				})
				Ui:C:mfm({
					text: noteText
				})
			]
		})
		noteEls.push(el)
	}

	// 显示界面
	Ui:render([
		Ui:C:text({ text: "本站时间线" })
		Ui:C:button({
			text: "刷新"
			onClick: @() {
				fetch()
			}
		})
		Ui:C:container({
			children: noteEls
		})
	])
}

fetch()
`;

const router = useRouter();

const props = defineProps<{
	id?: string;
}>();

const flash = ref<Misskey.entities.Flash | null>(null);

if (props.id) {
	flash.value = await misskeyApi('flash/show', {
		flashId: props.id,
	});
}

const title = ref(flash.value?.title ?? i18n.ts._play.defaultTitle);
const summary = ref(flash.value?.summary ?? '');
const permissions = ref([]); // not implemented yet
const {
	model: visibility,
	def: visibilityDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.public, value: 'public' },
		{ label: i18n.ts.private, value: 'private' },
	],
	initialValue: flash.value?.visibility ?? 'public',
});
const script = ref(flash.value?.script ?? PRESET_DEFAULT);

function selectPreset(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts._play._presets.omikuji,
		action: () => {
			script.value = PRESET_OMIKUJI;
		},
	}, {
		text: i18n.ts._play._presets.shuffle,
		action: () => {
			script.value = PRESET_SHUFFLE;
		},
	}, {
		text: i18n.ts._play._presets.quiz,
		action: () => {
			script.value = PRESET_QUIZ;
		},
	}, {
		text: i18n.ts._play._presets.timeline,
		action: () => {
			script.value = PRESET_TIMELINE;
		},
	}], ev.currentTarget ?? ev.target);
}

async function save() {
	if (flash.value != null) {
		await os.apiWithDialog('flash/update', {
			flashId: flash.value.id,
			title: title.value,
			summary: summary.value,
			permissions: permissions.value,
			script: script.value,
			visibility: visibility.value,
		});
		os.toast(i18n.ts._play.updated, 'success');
	} else {
		const created = await os.apiWithDialog('flash/create', {
			title: title.value,
			summary: summary.value,
			permissions: permissions.value,
			script: script.value,
			visibility: visibility.value,
		});
		os.toast(i18n.ts._play.created, 'success');
		router.push('/play/:id/edit', {
			params: {
				id: created.id,
			},
		});
	}
}

function show() {
	if (flash.value == null) {
		os.alert({
			text: i18n.ts._play.saveBeforePreview,
		});
	} else {
		os.pageWindow(`/play/${flash.value.id}`);
	}
}

async function del() {
	if (flash.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: flash.value.title }),
	});
	if (canceled) return;

	await os.apiWithDialog('flash/delete', {
		flashId: flash.value.id,
	});
	os.toast(i18n.ts._play.deleted, 'success');
	router.push('/play');
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: flash.value ? `${i18n.ts._play.edit}: ${flash.value.title}` : i18n.ts._play.new,
}));
</script>

<style lang="scss" module>
.footer {
	backdrop-filter: var(--MI-blur, blur(15px));
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	border-top: var(--MI-divider);
}
</style>
