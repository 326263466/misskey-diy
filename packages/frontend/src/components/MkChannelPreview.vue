<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="preview ? 'div' : 'MkA'" :to="preview ? undefined : `/channels/${channel.id}`" class="eftoefju" @click="!preview && updateLastReadedAt()">
	<div class="thumb">
		<img v-if="channel.bannerUrl" :src="channel.bannerUrl" alt=""/>
		<i v-else class="ti ti-broadcast" aria-hidden="true"></i>
	</div>
	<div class="body">
		<div class="name">
			<span
				v-if="hasUnread"
				class="unread"
				role="img"
				:title="i18n.ts.newNoteRecived"
				:aria-label="i18n.ts.newNoteRecived"
			></span>
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
	<span v-if="!preview" class="arrow" aria-hidden="true"><i class="ti ti-chevron-right"></i></span>
</component>
</template>

<script lang="ts" setup>
import { computed, onActivated, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

const props = defineProps<{
	channel: Misskey.entities.Channel;
	preview?: boolean;
}>();

const subscribed = computed(() => !props.preview && (props.channel.isFavorited === true || props.channel.isFollowing === true));
const lastNotedAt = computed(() => props.channel.lastNotedAt ? Date.parse(props.channel.lastNotedAt) : null);

const lastReadedAt = ref<number | null>(null);

// 阅读时间由频道页写入；列表页被 KeepAlive 缓存，重新显示时要再读一次。
function sync() {
	const id = props.channel.id;
	let readAt: number | null = miLocalStorage.getItemAsJson(`channelLastReadedAt:${id}`) ?? null;
	// 本机没有阅读记录时以当前最新帖为起点，否则换设备或清缓存后所有订阅频道都会显示未读。
	if (readAt == null && subscribed.value) {
		readAt = lastNotedAt.value ?? 0;
		miLocalStorage.setItemAsJson(`channelLastReadedAt:${id}`, readAt);
	}
	lastReadedAt.value = readAt;
}

watch(() => props.channel.id, sync, { immediate: true });
onActivated(sync);

const hasUnread = computed(() => subscribed.value && lastNotedAt.value != null && lastReadedAt.value != null && lastNotedAt.value > lastReadedAt.value);

const updateLastReadedAt = () => {
	lastReadedAt.value = lastNotedAt.value ?? Date.now();
};

</script>

<style lang="scss" scoped>
// 轻量目录卡片：封面、名称与统计保持一眼可扫，不在行间堆叠装饰。
.eftoefju {
	display: flex;
	align-items: flex-start;
	gap: 14px;
	width: 100%;
	min-width: 0;
	padding: 14px 15px;
	box-sizing: border-box;
	position: relative;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	text-decoration: none;
	transition:
		background-color .18s ease,
		border-color .18s ease,
		box-shadow .18s ease;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-panelHighlight);
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 28%, var(--MI_THEME-fg) 8%);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--MI_THEME-shadow) 35%, transparent);

		.arrow {
			color: var(--MI_THEME-accent);
			opacity: 1;
		}
	}

	&:active {
		background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 72%, var(--MI_THEME-panel));
	}

	&:focus {
		outline: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.thumb {
	flex-shrink: 0;
	width: 64px;
	height: 64px;
	border-radius: var(--MI-radius);
	overflow: hidden;
	display: grid;
	place-items: center;
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panelHighlight));
	color: var(--MI_THEME-accent);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);

	> img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	> i {
		font-size: 24px;
	}
}

.body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 5px;
}

.name {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	flex-wrap: wrap;
	font-size: 1.02em;
	font-weight: 650;
	line-height: 1.35;

	> .nameText {
		min-width: 0;
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
	padding: 1px 6px;
	border-radius: 6px;
	font-size: 0.76em;
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
	font-size: 0.88em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparent);
}

.meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 10px;
	font-size: 0.78em;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);

	> span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}
}

.updatedAt {
	margin-inline-start: auto;
}

.arrow {
	display: grid;
	flex-shrink: 0;
	align-self: center;
	place-items: center;
	width: 20px;
	height: 28px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 15px;
	opacity: .55;
	transition: color .18s ease, opacity .18s ease;
}

.unread {
	flex-shrink: 0;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--MI_THEME-accent);
}

@media (max-width: 520px) {
	.eftoefju {
		gap: 12px;
		padding: 12px;
	}

	.thumb {
		width: 54px;
		height: 54px;
		border-radius: var(--MI-radius);

		> i {
			font-size: 21px;
		}
	}

	.body {
		gap: 4px;
	}

	.updatedAt {
		margin-inline-start: 0;
	}

	.arrow {
		display: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.eftoefju,
	.arrow {
		transition: none;
	}
}

</style>
