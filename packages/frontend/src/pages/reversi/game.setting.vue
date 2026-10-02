<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<div class="_pageBody">
		<div style="text-align: center;"><b><MkUserName :user="game.user1"/></b> vs <b><MkUserName :user="game.user2"/></b></div>

		<div :class="{ [$style.disallow]: isReady }">
			<div class="_gaps" :class="{ [$style.disallowInner]: isReady }">
				<div style="font-size: 1.5em; text-align: center;">{{ i18n.ts._reversi.gameSettings }}</div>

				<template v-if="game.noIrregularRules">
					<div>{{ i18n.ts._reversi.disallowIrregularRules }}</div>
				</template>
				<template v-else>
					<div class="_panel">
						<div style="display: flex; align-items: center; padding: 16px; border-bottom: solid 1px var(--MI_THEME-divider);">
							<div>{{ mapName }}</div>
							<MkButton style="margin-left: auto;" @click="chooseMap">{{ i18n.ts._reversi.chooseBoard }}</MkButton>
						</div>

						<div style="padding: 16px;">
							<div v-if="game.map == null"><i class="ti ti-dice"></i></div>
							<div v-else :class="$style.board" :style="{ 'grid-template-rows': `repeat(${ game.map.length }, 1fr)`, 'grid-template-columns': `repeat(${ game.map[0].length }, 1fr)` }">
								<div v-for="(x, i) in game.map.join('')" :class="[$style.boardCell, { [$style.boardCellNone]: x == ' ' }]" @click="onMapCellClick(i, x)">
									<i v-if="x === 'b' || x === 'w'" style="pointer-events: none; user-select: none;" :class="x === 'b' ? 'ti ti-circle-filled' : 'ti ti-circle'"></i>
								</div>
							</div>
						</div>
					</div>

					<MkFolder :defaultOpen="true">
						<template #label>{{ i18n.ts._reversi.blackOrWhite }}</template>

						<MkRadios
							v-model="game.bw"
							:options="[
								{ value: 'random', label: i18n.ts.random },
								{ value: '1', slotId: 'user1' },
								{ value: '2', slotId: 'user2' },
							]"
						>
							<template #option-user1>
								<I18n :src="i18n.ts._reversi.blackIs" tag="span">
									<template #name>
										<b><MkUserName :user="game.user1"/></b>
									</template>
								</I18n>
							</template>
							<template #option-user2>
								<I18n :src="i18n.ts._reversi.blackIs" tag="span">
									<template #name>
										<b><MkUserName :user="game.user2"/></b>
									</template>
								</I18n>
							</template>
						</MkRadios>
					</MkFolder>

					<MkFolder :defaultOpen="true">
						<template #label>{{ i18n.ts._reversi.timeLimitForEachTurn }}</template>
						<template #suffix>{{ game.timeLimitForEachTurn }}{{ i18n.ts._time.second }}</template>

						<MkRadios
							v-model="game.timeLimitForEachTurn"
							:options="gameTurnOptionsDef"
						>
						</MkRadios>
					</MkFolder>

					<MkFolder :defaultOpen="true">
						<template #label>{{ i18n.ts._reversi.rules }}</template>

						<div class="_gaps_s">
							<MkSwitch v-model="game.isLlotheo" @update:modelValue="updateSettings('isLlotheo')">{{ i18n.ts._reversi.isLlotheo }}</MkSwitch>
							<MkSwitch v-model="game.loopedBoard" @update:modelValue="updateSettings('loopedBoard')">{{ i18n.ts._reversi.loopedMap }}</MkSwitch>
							<MkSwitch v-model="game.canPutEverywhere" @update:modelValue="updateSettings('canPutEverywhere')">{{ i18n.ts._reversi.canPutEverywhere }}</MkSwitch>
						</div>
					</MkFolder>
				</template>
			</div>
		</div>
	</div>
	<template #footer>
		<div :class="$style.footer">
			<div class="_pageFooter">
				<div style="text-align: center;" class="_gaps_s">
					<div v-if="opponentHasSettingsChanged" style="color: var(--MI_THEME-warn);">{{ i18n.ts._reversi.opponentHasSettingsChanged }}</div>
					<div>
						<template v-if="isReady && isOpReady">{{ i18n.ts._reversi.thisGameIsStartedSoon }}<MkEllipsis/></template>
						<template v-if="isReady && !isOpReady">{{ i18n.ts._reversi.waitingForOther }}<MkEllipsis/></template>
						<template v-if="!isReady && isOpReady">{{ i18n.ts._reversi.waitingForMe }}</template>
						<template v-if="!isReady && !isOpReady">{{ i18n.ts._reversi.waitingBoth }}<MkEllipsis/></template>
					</div>
					<div class="_buttonsCenter">
						<MkButton rounded danger @click="cancel">{{ i18n.ts.cancel }}</MkButton>
						<MkButton v-if="!isReady" rounded primary @click="ready">{{ i18n.ts._reversi.ready }}</MkButton>
						<MkButton v-if="isReady" rounded @click="unready">{{ i18n.ts._reversi.cancelReady }}</MkButton>
					</div>
					<div>
						<MkSwitch v-model="shareWhenStart">{{ i18n.ts._reversi.shareToTlTheGameWhenStart }}</MkSwitch>
					</div>
				</div>
			</div>
		</div>
	</template>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, watch, ref, onUnmounted } from 'vue';
import * as Misskey from 'misskey-js';
import * as Reversi from 'misskey-reversi';
import type { MenuItem } from '@/types/menu.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { deepClone } from '@/utility/clone.js';
import MkButton from '@/components/MkButton.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFolder from '@/components/MkFolder.vue';
import * as os from '@/os.js';
import type { MkRadiosOption } from '@/components/MkRadios.vue';
import { useRouter } from '@/router.js';

const router = useRouter();

const builtinMaps = (Object.keys(Reversi.maps) as (keyof typeof Reversi.maps)[]).map(id => ({ id, ...Reversi.maps[id] }));
const mapCategories = Array.from(new Set(builtinMaps.map(x => x.category)));
const builtinMapNames = computed<Record<keyof typeof Reversi.maps, string>>(() => ({
	fourfour: '4x4',
	sixsix: '6x6',
	roundedSixsix: i18n.tsx._reversi._maps.rounded({ size: '6x6' }),
	roundedSixsix2: i18n.tsx._reversi._maps.roundedVariant({ size: '6x6', variant: 2 }),
	eighteight: '8x8',
	eighteightH28: i18n.tsx._reversi._maps.handicap({ size: '8x8', stones: 28 }),
	roundedEighteight: i18n.tsx._reversi._maps.rounded({ size: '8x8' }),
	roundedEighteight2: i18n.tsx._reversi._maps.roundedVariant({ size: '8x8', variant: 2 }),
	roundedEighteight3: i18n.tsx._reversi._maps.roundedVariant({ size: '8x8', variant: 3 }),
	eighteightWithNotch: i18n.ts._reversi._maps.withNotch,
	eighteightWithSomeHoles: i18n.ts._reversi._maps.withHoles,
	circle: i18n.ts._reversi._maps.circle,
	smile: i18n.ts._reversi._maps.smile,
	window: i18n.ts._reversi._maps.window,
	reserved: i18n.ts._reversi._maps.reserved,
	x: 'X',
	parallel: i18n.ts._reversi._maps.parallel,
	lackOfBlack: i18n.ts._reversi._maps.lackOfBlack,
	squareParty: i18n.ts._reversi._maps.squareParty,
	minesweeper: i18n.ts._reversi._maps.minesweeper,
	tenthtenth: '10x10',
	hole: i18n.ts._reversi._maps.hole,
	grid: i18n.ts._reversi._maps.grid,
	cross: i18n.ts._reversi._maps.cross,
	charX: i18n.tsx._reversi._maps.letter({ letter: 'X' }),
	charY: i18n.tsx._reversi._maps.letter({ letter: 'Y' }),
	walls: i18n.ts._reversi._maps.walls,
	cpu: 'CPU',
	checker: i18n.ts._reversi._maps.checker,
	japaneseCurry: i18n.ts._reversi._maps.japaneseCurry,
	mosaic: i18n.ts._reversi._maps.mosaic,
	arena: i18n.ts._reversi._maps.arena,
	reactor: i18n.ts._reversi._maps.reactor,
	sixeight: '6x8',
	spark: i18n.ts._reversi._maps.spark,
	islands: i18n.ts._reversi._maps.islands,
	galaxy: i18n.ts._reversi._maps.galaxy,
	triangle: i18n.ts._reversi._maps.triangle,
	iphonex: 'iPhone X',
	dealWithIt: 'Deal with it!',
	twoBoard: i18n.ts._reversi._maps.twoBoard,
}));

const props = defineProps<{
	game: Misskey.entities.ReversiGameDetailed;
	connection: Misskey.IChannelConnection<Misskey.Channels['reversiGame']>;
}>();

const shareWhenStart = defineModel<boolean>('shareWhenStart', { default: false });

const game = ref<Misskey.entities.ReversiGameDetailed>(deepClone(props.game));

const gameTurnOptionsDef = [
	{ value: 5, label: '5' + i18n.ts._time.second },
	{ value: 10, label: '10' + i18n.ts._time.second },
	{ value: 30, label: '30' + i18n.ts._time.second },
	{ value: 60, label: '60' + i18n.ts._time.second },
	{ value: 90, label: '90' + i18n.ts._time.second },
	{ value: 120, label: '120' + i18n.ts._time.second },
	{ value: 180, label: '180' + i18n.ts._time.second },
	{ value: 3600, label: '3600' + i18n.ts._time.second },
] as MkRadiosOption<number>[];

const mapName = computed(() => {
	if (game.value.map == null) return i18n.ts.random;
	const found = builtinMaps.find(x => x.data.join('') === game.value.map.join(''));
	return found ? builtinMapNames.value[found.id] : i18n.ts.custom;
});
const isReady = computed(() => {
	if (game.value.user1Id === $i?.id && game.value.user1Ready) return true;
	if (game.value.user2Id === $i?.id && game.value.user2Ready) return true;
	return false;
});
const isOpReady = computed(() => {
	if (game.value.user1Id !== $i?.id && game.value.user1Ready) return true;
	if (game.value.user2Id !== $i?.id && game.value.user2Ready) return true;
	return false;
});

const opponentHasSettingsChanged = ref(false);

watch(() => game.value.bw, () => {
	updateSettings('bw');
});

watch(() => game.value.timeLimitForEachTurn, () => {
	updateSettings('timeLimitForEachTurn');
});

function chooseMap(ev: PointerEvent) {
	const menu: MenuItem[] = [];

	for (const c of mapCategories) {
		const maps = builtinMaps.filter(x => x.category === c);
		if (maps.length === 0) continue;
		if (c != null) {
			menu.push({
				type: 'label',
				text: c === 'Special' ? i18n.ts._reversi.specialMaps : c,
			});
		}
		for (const m of maps) {
			menu.push({
				text: builtinMapNames.value[m.id],
				action: () => {
					game.value.map = m.data;
					updateSettings('map');
				},
			});
		}
	}

	os.popupMenu(menu, ev.currentTarget ?? ev.target);
}

async function cancel() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	props.connection.send('cancel', {});

	router.push('/reversi');
}

function ready() {
	props.connection.send('ready', true);
	opponentHasSettingsChanged.value = false;
}

function unready() {
	props.connection.send('ready', false);
}

function onChangeReadyStates(states: {
	user1: boolean;
	user2: boolean;
}) {
	game.value.user1Ready = states.user1;
	game.value.user2Ready = states.user2;
}

function updateSettings(key: typeof Misskey.reversiUpdateKeys[number]) {
	props.connection.send('updateSettings', {
		key: key,
		value: game.value[key],
	});
}

function onUpdateSettings<K extends typeof Misskey.reversiUpdateKeys[number]>({ userId, key, value }: { userId: string; key: K; value: Misskey.entities.ReversiGameDetailed[K]; }) {
	if (userId === $i?.id) return;
	if (game.value[key] === value) return;
	game.value[key] = value;
	if (isReady.value) {
		opponentHasSettingsChanged.value = true;
		unready();
	}
}

function onMapCellClick(pos: number, pixel: string) {
	const x = pos % game.value.map[0].length;
	const y = Math.floor(pos / game.value.map[0].length);
	const newPixel =
		pixel === ' ' ? '-' :
		pixel === '-' ? 'b' :
		pixel === 'b' ? 'w' :
		' ';
	const line = game.value.map[y].split('');
	line[x] = newPixel;
	game.value.map[y] = line.join('');
	updateSettings('map');
}

props.connection.on('changeReadyStates', onChangeReadyStates);
props.connection.on('updateSettings', onUpdateSettings);

onUnmounted(() => {
	props.connection.off('changeReadyStates', onChangeReadyStates);
	props.connection.off('updateSettings', onUpdateSettings);
});
</script>

<style lang="scss" module>
.disallow {
	cursor: not-allowed;
}
.disallowInner {
	pointer-events: none;
	user-select: none;
	opacity: 0.7;
}

.board {
	display: grid;
	grid-gap: 4px;
	width: 300px;
	height: 300px;
	margin: 0 auto;
	color: var(--MI_THEME-fg);
}

.boardCell {
	display: grid;
	place-items: center;
	background: transparent;
	border: solid 2px var(--MI_THEME-divider);
	border-radius: 6px;
	overflow: clip;
	cursor: pointer;
}
.boardCellNone {
	border-color: transparent;
}

.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	border-top: solid 0.5px var(--MI_THEME-divider);
}
</style>
