<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" @click="close" @esc="close" @closed="emit('closed')">
	<section :class="[$style.card, { [$style.unopened]: unopened }]" role="dialog" aria-modal="true" :aria-label="i18n.ts._redPacket.claim">
		<button type="button" class="_button" :class="$style.close" :disabled="claiming" :aria-label="i18n.ts.close" @click="close"><i class="ti ti-x" aria-hidden="true"></i></button>
		<header :class="[$style.hero, { [$style.customCover]: packet.coverUrl && !coverFailed }]">
			<img v-if="packet.coverUrl && !coverFailed" :key="packet.coverUrl" :src="packet.coverUrl" :alt="i18n.ts._redPacket.cover" :class="$style.coverImage" @error="coverFailed = true">
			<span :class="$style.heroPattern" aria-hidden="true"></span>
			<div :class="$style.meta">
				<div :class="$style.senderLine">
					<MkAvatar v-if="sender" :user="sender" :class="$style.senderAvatar"/>
					<span v-else :class="$style.senderAvatarPlaceholder" aria-hidden="true"></span>
					<p :class="$style.senderText">
						<span v-if="sender" :class="$style.senderName"><MkUserName :user="sender"/></span>
						<span>{{ i18n.ts._redPacket.senderSuffix }}</span>
						<span v-if="!unopened && packet.password" :class="$style.modeBadge" :title="i18n.ts._redPacket.passwordPacket">{{ i18n.ts._redPacket.password }}</span>
						<span v-else-if="!unopened && packet.mode === 'random'" :class="$style.modeBadge" :title="i18n.ts._redPacket.random">{{ i18n.ts._redPacket.luckBadge }}</span>
					</p>
				</div>
				<p :class="$style.greeting"><Mfm :text="greetingText" :plain="true" :nowrap="true" :noEmojiTooltip="true" style="white-space: nowrap;"/></p>
			</div>
		</header>

		<div v-if="unopened" :class="$style.envelope">
			<button type="button" class="_button" :class="$style.seal" :aria-label="i18n.ts._redPacket.claim" :disabled="loading || claiming || !details" @click="claim">
				<span>{{ i18n.ts._redPacket.openSeal }}</span>
			</button>
			<button v-if="failed" type="button" class="_textButton" :class="$style.textAction" :disabled="loading || claiming" @click="load">{{ i18n.ts.retry }} <i class="ti ti-arrow-right" aria-hidden="true"></i></button>
			<button type="button" class="_textButton" :class="$style.textAction" :disabled="loading || claiming" @click="showDetails = true">{{ i18n.ts._redPacket.viewClaimDetails }} <i class="ti ti-arrow-right" aria-hidden="true"></i></button>
		</div>

		<div v-else :class="$style.details">
			<p v-if="packet.claimedCoins != null" role="status" :aria-label="resultMessage" :class="[$style.result, $style.resultClaimed]">
				<strong :class="$style.receivedAmount">{{ formatCoins(packet.claimedCoins) }}</strong>
				<span :class="$style.receivedUnit">{{ i18n.ts._transfer.coinUnit }}</span>
			</p>
			<p v-else-if="resultMessage" role="status" :class="$style.result">{{ resultMessage }}</p>
			<p v-if="packet.startsAt"><span>{{ i18n.ts._redPacket.startsAt }}: </span><MkTime :time="packet.startsAt" mode="detail"/></p>
			<p v-if="!$i" :class="$style.notice">{{ i18n.ts._redPacket.signinRequired }}</p>
			<div :class="$style.summary">
				<span>{{ i18n.tsx._redPacket.summaryTotal({ coins: formatCoins(packet.totalCoins) }) }}</span>
				<span>{{ i18n.tsx._redPacket.summaryCount({ claimed: packet.count - packet.remainingCount, count: packet.count }) }}</span>
			</div>
			<p v-if="details == null && !loading && !failed" :class="$style.notice">{{ i18n.ts._redPacket.unavailable }}</p>
			<div v-else-if="details?.claims.length === 0" :class="$style.claimsFrame">
				<p :class="[$style.notice, $style.emptyClaims]">{{ i18n.ts._redPacket.noClaims }}</p>
			</div>
			<div v-else-if="details" :class="$style.claimsFrame">
				<ul :class="$style.claims" tabindex="0" :aria-label="i18n.ts._redPacket.claims">
					<li v-for="entry in details.claims" :key="entry.id" :class="$style.claim">
						<MkAvatar v-if="entry.user" :user="entry.user" :class="$style.claimAvatar"/>
						<span v-else :class="[$style.claimAvatar, $style.claimAvatarDeleted]" aria-hidden="true"><i class="ti ti-user-off"></i></span>
						<span :class="$style.claimInfo">
							<span :class="$style.claimName" :title="entry.user?.name || entry.user?.username || i18n.ts._redPacket.deletedUser"><MkUserName v-if="entry.user" :user="entry.user"/><span v-else>{{ i18n.ts._redPacket.deletedUser }}</span></span>
							<time :datetime="entry.createdAt" :title="formatClaimTime(entry.createdAt, true)" :class="$style.claimTime">{{ formatClaimTime(entry.createdAt) }}</time>
						</span>
						<span :class="$style.claimAmount">
							<span :class="$style.claimCoins">{{ i18n.tsx._redPacket.coins({ coins: formatCoins(entry.coins) }) }}</span>
						</span>
					</li>
				</ul>
			</div>
			<button v-if="failed" type="button" class="_textButton" :class="$style.textAction" :disabled="loading || claiming" @click="load">{{ i18n.ts.retry }} <i class="ti ti-arrow-right" aria-hidden="true"></i></button>
			<div v-if="canClaim" :class="$style.actions">
				<MkButton primary rounded :disabled="loading || claiming || !details" :wait="claiming" @click="claim">{{ i18n.ts._redPacket.claim }}</MkButton>
			</div>
		</div>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch, useTemplateRef } from 'vue';
import type { entities } from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { versatileLang } from '@@/js/intl-const.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { redPacketError } from '@/utility/red-packet.js';
import * as os from '@/os.js';

const props = defineProps<{ redPacketId: string; authorId: string; redPacket: entities.RedPacketsCreateResponse; author?: entities.UserLite | null }>();
const emit = defineEmits<{ (event: 'claimed'): void; (event: 'updated', packet: entities.RedPacketsShowResponse): void; (event: 'closed'): void }>();
const modal = useTemplateRef('modal');

const packet = ref(props.redPacket);
const details = ref<entities.RedPacketsShowResponse | null>(null);
const showDetails = ref(false);
const loading = ref(false);
const claiming = ref(false);
const failed = ref(false);
const coverFailed = ref(false);

const sender = ref<entities.UserLite | null>(
	props.author != null && props.author.id === (props.redPacket.senderId ?? props.authorId) ? props.author : null,
);
let timer: number | undefined;
let request = 0;
watch(() => props.redPacket, value => { packet.value = value; });
watch(() => packet.value.coverUrl, () => { coverFailed.value = false; });
const state = computed(() => packet.value.status);
const canClaim = computed(() => $i && !$i.isSuspended && !packet.value.password && state.value === 'active' && packet.value.claimedCoins == null);
const unopened = computed(() => canClaim.value && !showDetails.value);
// 口令红包的祝福语位置展示口令，与聊天气泡的展示规则一致
const greetingText = computed(() => packet.value.password || packet.value.message || i18n.ts._redPacket.defaultMessage);

function formatCoins(coins: number): string {
	return coins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const claimClockFormat = new Intl.DateTimeFormat(versatileLang, { hour: '2-digit', minute: '2-digit' });
const claimDateTimeFormat = new Intl.DateTimeFormat(versatileLang, { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 今天领取的只显示时分，其他日期显示完整日期和时分。
function formatClaimTime(value: string, full = false): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return i18n.ts._ago.invalid;
	if (full || date.toDateString() !== new Date().toDateString()) return claimDateTimeFormat.format(date);
	return claimClockFormat.format(date);
}

// 详情卡顶部的大字提示：自己已领取时显示到账金额，否则按红包状态给出原因。
const resultMessage = computed(() => {
	if (packet.value.claimedCoins != null) return i18n.tsx._redPacket.receivedCoins({ coins: packet.value.claimedCoins.toLocaleString() });
	if (state.value === 'exhausted') return i18n.ts._redPacket.allGone;
	if (state.value === 'scheduled') return i18n.ts._redPacket.scheduled;
	if (state.value === 'expired') return i18n.ts._redPacket.expired;
	if (state.value === 'cancelled') return i18n.ts._redPacket.cancelled;
	return '';
});

function close() {
	if (claiming.value) return;
	modal.value?.close();
}

function applyResult(result: entities.RedPacketsShowResponse) {
	const newlyClaimed = packet.value.claimedCoins == null && result.claimedCoins != null;
	details.value = result;
	packet.value = result;
	emit('updated', result);
	if (newlyClaimed) emit('claimed');
}

async function load() {
	if (!$i || loading.value || claiming.value) return;
	const sequence = ++request;
	loading.value = true;
	failed.value = false;
	try {
		const result = await misskeyApi('red-packets/show', { redPacketId: props.redPacketId });
		if (sequence !== request) return;
		applyResult(result);
	} catch (err) {
		if (sequence === request) {
			failed.value = true;
			os.toast(redPacketError(err), 'error');
		}
	} finally {
		if (sequence === request) loading.value = false;
	}
}

async function claim() {
	if (!canClaim.value || claiming.value || loading.value || !details.value) return;
	claiming.value = true;
	const sequence = ++request;
	failed.value = false;
	try {
		const result = await misskeyApi('red-packets/claim', { redPacketId: props.redPacketId });
		if (sequence !== request) return;
		applyResult(result);
		showDetails.value = true;
	} catch (err) {
		if (sequence !== request) return;
		failed.value = true;
		// 领取成功也可能丢失响应，重试前先核对到账状态。
		try {
			const result = await misskeyApi('red-packets/show', { redPacketId: props.redPacketId });
			if (sequence !== request) return;
			applyResult(result);
			if (result.claimedCoins != null) {
				failed.value = false;
				showDetails.value = true;
			} else if (result.status !== 'active') {
				// 已被别人抢完或过期时不再提示原始错误，详情页会给出原因。
				failed.value = false;
			}
		} catch { /* 保留原错误，允许重试。 */ }
		if (failed.value && sequence === request) os.toast(redPacketError(err), 'error');
	} finally {
		claiming.value = false;
	}
}

function scheduleExpiry() {
	window.clearTimeout(timer);
	if (!['active', 'scheduled'].includes(packet.value.status)) return;
	const boundary = packet.value.status === 'scheduled' ? packet.value.startsAt : packet.value.expiresAt;
	const delay = Date.parse(boundary ?? '') - Date.parse(packet.value.serverTime);
	if (Number.isFinite(delay)) timer = window.setTimeout(() => { void load(); }, Math.min(Math.max(delay + 50, 1000), 2147483647));
}

watch(() => packet.value, scheduleExpiry);
onMounted(() => {
	scheduleExpiry();
	void load();
	if (sender.value == null) {
		void misskeyApi('users/show', { userId: packet.value.senderId ?? props.authorId })
			.then(user => { sender.value = user; })
			.catch(() => { /* 拿不到发送者信息时仅省略头像昵称，不影响领取。 */ });
	}
});
onUnmounted(() => { window.clearTimeout(timer); request++; });
</script>

<style lang="scss" module>
.card {
	--MI-redPacketClaimHeight: 52px;
	position: relative;
	box-sizing: border-box;
	margin: auto;
	// 参考微信红包：窄长的信封比例
	width: 360px;
	max-width: calc(100vw - 32px);
	max-height: calc(100dvh - 32px);
	overflow: auto;
	display: flex;
	flex-direction: column;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	// 红包是展示卡片，禁用文字划选避免误选拉出翻译/搜索弹层
	user-select: none;
	-webkit-user-select: none;
}

.unopened {
	--MI-redPacketSealSize: clamp(80px, 24vw, 100px);
	// 弧线下方延续封面渐变的末端色，整张信封同用已领取顶部的深红样式
	background: var(--MI-redPacketEnd);
	color: var(--MI-redPacketGold);

	.hero {
		min-height: min(100vw, 340px, calc(100dvh - 164px));
		box-shadow: 0 2px 3px -2px color-mix(in srgb, var(--MI-redPacketShade) 55%, transparent);
	}
}

.close {
	position: absolute;
	top: 10px;
	right: 10px;
	z-index: 2;
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	color: var(--MI_THEME-fgOnAccent);
	background: color-mix(in srgb, var(--MI-redPacketEnd) 60%, transparent);

	&:hover {
		background: var(--MI-redPacketEnd);
	}
}

.hero {
	position: relative;
	flex-shrink: 0;
	box-sizing: border-box;
	overflow: hidden;
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	// 未领取与已领取的顶部样式一致：内容贴顶、留白与弧线相同
	align-items: start;
	min-height: 156px;
	padding: 44px 24px 36px;
	background: linear-gradient(160deg, var(--MI-redPacketStart), var(--MI-redPacketEnd));
	color: var(--MI-redPacketGold);
	// 底缘向下凸出的椭圆弧，呈现信封开口的形状
	border-radius: var(--MI-radius) var(--MI-radius) 50% 50% / var(--MI-radius) var(--MI-radius) clamp(32px, 12vw, 48px) clamp(32px, 12vw, 48px);
}

.coverImage {
	position: absolute;
	inset: 0;
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.heroPattern {
	position: absolute;
	inset: 0;
	background: repeating-radial-gradient(circle at 105% -20%, transparent 0 24px, color-mix(in srgb, var(--MI-redPacketGold) 14%, transparent) 25px 26px, transparent 27px 48px);
}

.customCover {
	.heroPattern {
		// 只在顶部压暗保证发布者和寄语可读，封面主体保持清晰
		background: linear-gradient(180deg, color-mix(in srgb, var(--MI-redPacketShade) 72%, transparent), color-mix(in srgb, var(--MI-redPacketShade) 30%, transparent) 45%, transparent 70%);
	}
}

.meta {
	position: relative;
	min-width: 0;
	display: flex;
	flex-shrink: 0;
	flex-direction: column;
	align-items: center;
	gap: 18px;
	text-align: center;
}

.senderAvatar {
	width: 28px;
	height: 28px;
	flex-shrink: 0;
	box-shadow: 0 4px 12px -6px color-mix(in srgb, var(--MI-redPacketEnd) 70%, transparent);
}

.senderAvatarPlaceholder {
	width: 28px;
	height: 28px;
	flex-shrink: 0;
	border-radius: 50%;
	background: color-mix(in srgb, var(--MI-redPacketGold) 25%, transparent);
}

.senderLine {
	display: flex;
	max-width: 100%;
	justify-content: center;
	align-items: center;
	gap: 10px;
}

.senderText {
	margin: 0;
	min-width: 0;
	// 避免昵称外层再次建立基线行盒，文字与表情共用头像的视觉中线。
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 6px;
	overflow-wrap: anywhere;
	line-height: 1;

	> span:not(.modeBadge) {
		display: inline-flex;
		align-items: center;
		min-height: 1.25em;
	}
}

.senderName {
	min-width: 0;
	overflow-wrap: anywhere;

	:global(._userName) { padding-block: 0; }
}

.modeBadge {
	display: inline-flex;
	align-items: center;
	// 字号略小于正文；1.45em 为缩放后字号的盒高，约合正文字高
	height: 1.45em;
	padding: 0 5px;
	border-radius: 4px;
	font-size: .75em;
	line-height: 1;
	background: var(--MI-redPacketGold);
	color: var(--MI-redPacketEnd);
}

.greeting {
	margin: 0;
	max-width: 100%;
	font-size: clamp(16px, 4.5vw, 20px);
	font-weight: 700;
	letter-spacing: .04em;
	line-height: 1.5;
	color: inherit;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.envelope {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 24px;
	flex-shrink: 0;
	// 底部留白与封面顶部一致，保证卡片上下内边距对称
	padding: 0 24px 44px;

	:global(._textButton) {
		color: inherit;
	}
}

.card .textAction {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.seal {
	position: relative;
	margin-top: calc(var(--MI-redPacketSealSize) / -2);
	display: grid;
	place-items: center;
	width: var(--MI-redPacketSealSize);
	height: var(--MI-redPacketSealSize);
	border-radius: 50%;
	border: 1px solid var(--MI-redPacketGold);
	background: var(--MI-redPacketStart);
	color: var(--MI-redPacketGold);
	font-size: calc(var(--MI-redPacketSealSize) * .4);
	font-weight: 400;
	box-shadow: 0 3px 6px color-mix(in srgb, var(--MI-redPacketShade) 30%, transparent);
	transition: background-color 160ms ease, transform 160ms ease-out;

	&:hover:not(:disabled) {
		background: var(--MI-redPacketStart);
	}

	&:active {
		transform: scale(.96);
	}

	&:disabled {
		opacity: .75;
	}

	&:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 4px;
	}
}

.details {
	display: flex;
	flex-direction: column;
	min-height: 160px;
	gap: 0;
	--MI-redPacketDetailsInline: 20px;
	// 弧线和金额、金额和领取列表之间保持紧凑且对称的留白。
	padding: 14px var(--MI-redPacketDetailsInline);

	> :not(.claimsFrame) {
		flex-shrink: 0;
	}

	// 列表收尾时底部保持卡片内边距，仅去掉加载态最小高度，避免富余空间叠加在列表下方。
	&:has(> .claimsFrame:last-child) {
		min-height: 0;
	}
}

.result {
	margin: 0 0 14px;
	font-size: 1.6em;
	font-weight: 500;
	text-align: center;
	overflow-wrap: anywhere;
}

.resultClaimed {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	align-items: baseline;
	gap: 6px;
	color: var(--MI-redPacketAmount);
	font-variant-numeric: tabular-nums;
}

.receivedAmount {
	font-size: clamp(22px, 6vw, 32px);
	font-weight: 700;
	line-height: 1.15;
}

.receivedUnit {
	font-size: 13px;
	color: var(--MI-redPacketAmount);
}

.notice {
	margin: 12px 0;
	font-size: .9em;
	line-height: 1.6;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
	overflow-wrap: anywhere;
}

// 空态复用领取列表的容器与高度，汇总线和记录区的布局与有记录时一致
.emptyClaims {
	display: grid;
	place-items: center;
	min-height: var(--MI-redPacketClaimHeight);
	margin: 0;
}

.summary {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 12px;
	padding: 8px 0;
	// 与行间分割线同款，保持列表顶部和行间的线一致。
	border-bottom: var(--MI-divider);
	font-size: .9em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;
}

// 外层与表头同宽并作为尺寸容器：行宽取外层宽度，内容与表头左右对齐；列表本身向右伸到弹窗边缘放滚动条。
.claimsFrame {
	position: relative;
	display: flex;
	flex-direction: column;
	min-height: 0;
	container-type: inline-size;

	// 焦点框左右各外扩 8px，与内容保持间距，且不框住滚动条。
	&:has(> .claims:focus-visible)::after {
		content: '';
		position: absolute;
		inset: 0 -8px;
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
		pointer-events: none;
	}
}

.claims {
	list-style: none;
	// 滚动条贴到弹窗右缘：列表向右伸进 .details 的内边距；行宽固定为表头宽度，滚动条宽度不影响对齐。
	margin: 0 calc(-1 * var(--MI-redPacketDetailsInline)) 0 0;
	padding: 0;
	min-height: var(--MI-redPacketClaimHeight);
	max-height: calc(var(--MI-redPacketClaimHeight) * 5);
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;

	// 列表伸到弹窗右缘，自身描边会把滚动条框进去，焦点框改由 .claimsFrame 绘制。
	&:focus,
	&:focus-visible {
		outline: none;
	}
}

.claim {
	box-sizing: border-box;
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100cqi;
	height: var(--MI-redPacketClaimHeight);
	padding: 8px 0;
	line-height: 1.35;

	& + .claim {
		// 与 credit 站领取列表一致：细淡分割线，只画在行与行之间，末行不带线。
		border-top: var(--MI-divider);
	}
}

.claimAvatar {
	width: 32px;
	height: 32px;
	flex-shrink: 0;
}

.claimAvatarDeleted {
	display: grid;
	place-items: center;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fgTransparentWeak);
}

.claimInfo {
	min-width: 0;
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	align-self: stretch;
}

// 列表中金额比用户名略小，时间再缩小一级。
.claimCoins {
	font-size: .95em;
	line-height: 1.35;
}

.claimTime {
	font-size: .8em;
	line-height: 1.35;
	color: var(--MI_THEME-fgTransparentWeak);
}

.claimName {
	display: flex;
	align-items: center;
	min-height: 1.35em;
	font-weight: 400;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	:global(._userName) { padding-block: 0; }
}

// 列表中除用户名外，时间使用副色；金额沿用顶部到账金额的强调色。
.claimCoins {
	color: var(--MI-redPacketAmount);
}

.claimTime {
	color: var(--MI_THEME-fgTransparentWeak);
}

.claimAmount {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	justify-content: space-between;
	align-self: stretch;
	flex-shrink: 0;
	max-width: 50%;
	overflow-wrap: anywhere;
	font-variant-numeric: tabular-nums;
}

.actions {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	padding: 16px 0 0;

	> button {
		--MI_THEME-accent: var(--MI-redPacketStart);
		--MI_THEME-accentDarken: var(--MI-redPacketEnd);
		--MI_THEME-accentHover: var(--MI-redPacketStart);
		--MI_THEME-accentActive: var(--MI-redPacketStart);
		--MI_THEME-fgOnAccent: var(--MI-redPacketGold);

		&:hover:not(:disabled), &:active:not(:disabled) {
			transform: none;
			background: var(--MI-redPacketStart);
		}
	}
}

@media (prefers-reduced-motion: reduce) {
	.seal {
		transition: none;

		&:active {
			transform: none;
		}
	}
}
</style>
