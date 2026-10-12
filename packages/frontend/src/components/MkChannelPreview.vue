<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div style="position: relative;">
	<component :is="preview ? 'div' : 'MkA'" :to="preview ? undefined : `/channels/${channel.id}`" class="eftoefju" @click="!preview && updateLastReadedAt()">
		<div class="thumb">
			<img v-if="channel.bannerUrl" :src="channel.bannerUrl" alt=""/>
			<i v-else class="ti ti-device-tv" aria-hidden="true"></i>
		</div>
		<div class="body">
			<div class="name">
				<span class="nameText"><Mfm :text="channel.name" :plain="true" :nowrap="true"/></span>
				<span v-if="channel.isSensitive" class="chip warn">{{ i18n.ts.sensitive }}</span>
				<span v-if="channel.isArchived" class="chip"><i class="ti ti-archive"></i>{{ i18n.ts.archived }}</span>
				<span v-if="$i != null && $i.id === channel.userId" class="chip admin" :title="i18n.ts.youAreAdmin"><i class="ti ti-user-star"></i></span>
			</div>
			<p v-if="channel.description" class="description" :title="channel.description"><Mfm :text="channel.description" :plain="true"/></p>
			<div class="meta">
				<span><i class="ti ti-users" aria-hidden="true"></i>{{ i18n.tsx._channel.usersCount({ n: channel.usersCount }) }}</span>
				<span><i class="ti ti-pencil" aria-hidden="true"></i>{{ i18n.tsx._channel.notesCount({ n: channel.notesCount }) }}</span>
				<span v-if="channel.lastNotedAt" class="updatedAt"><MkTime :time="channel.lastNotedAt"/></span>
			</div>
		</div>
	</component>
	<div
		v-if="!preview && channel.lastNotedAt && (channel.isFavorited || channel.isFollowing) && (!lastReadedAt || Date.parse(channel.lastNotedAt) > lastReadedAt)"
		class="indicator"
	></div>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

const props = defineProps<{
	channel: Misskey.entities.Channel;
	preview?: boolean;
}>();

const getLastReadedAt = (): number | null => {
	return miLocalStorage.getItemAsJson(`channelLastReadedAt:${props.channel.id}`) ?? null;
};

const lastReadedAt = ref(getLastReadedAt());

watch(() => props.channel.id, () => {
	lastReadedAt.value = getLastReadedAt();
});

const updateLastReadedAt = () => {
	lastReadedAt.value = props.channel.lastNotedAt ? Date.parse(props.channel.lastNotedAt) : Date.now();
};

</script>

<style lang="scss" scoped>
// 主流论坛范式的频道行：小缩略图 + 标题/描述/元信息，密度优先。
.eftoefju {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	width: 100%;
	padding: 12px 16px;
	box-sizing: border-box;
	position: relative;
	transition: background 0.15s;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-panelHighlight);
	}

	&:focus-within {
		outline: none;

		&::after {
			content: '';
			position: absolute;
			inset: 0;
			border-radius: inherit;
			pointer-events: none;
			box-shadow: inset 0 0 0 2px var(--MI_THEME-focus);
		}
	}
}

.thumb {
	flex-shrink: 0;
	width: 56px;
	height: 56px;
	border-radius: calc(var(--MI-radius) / 2);
	overflow: hidden;
	display: grid;
	place-items: center;
	// 未设置横幅图时以中性渐变兜底
	background-image: linear-gradient(135deg, var(--MI_THEME-accentedBg), var(--MI_THEME-panelHighlight));

	> img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	> i {
		font-size: 20px;
		color: #fff;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
	}
}

.body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.name {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	font-weight: 700;
	line-height: 1.4;

	> .nameText {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.chip {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 1px 7px;
	border-radius: 999px;
	font-size: 0.72em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparent);
	background: var(--MI_THEME-panelHighlight);

	&.warn {
		color: var(--MI_THEME-warn);
	}

	&.admin {
		color: var(--MI_THEME-warn);
	}
}

.description {
	margin: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparent);
}

.meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 12px;
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);

	> span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
}

.indicator {
	position: absolute;
	top: 0;
	right: 0;
	transform: translate(25%, -25%);
	background-color: var(--MI_THEME-accent);
	border: solid var(--MI_THEME-bg) 4px;
	border-radius: 100%;
	width: 1.5rem;
	height: 1.5rem;
	aspect-ratio: 1 / 1;
}

</style>
