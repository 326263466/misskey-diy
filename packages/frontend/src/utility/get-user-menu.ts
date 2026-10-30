/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toUnicode } from 'punycode.js';
import { defineAsyncComponent, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { host, url } from '@@/js/config.js';
import type { Router } from '@/router.js';
import type { MenuItem } from '@/types/menu.js';
import { i18n } from '@/i18n.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { $i, iAmAdmin, iAmModerator } from '@/i.js';
import { notesSearchAvailable, canSearchNonLocalNotes } from '@/utility/check-permissions.js';
import { antennasCache, userListsCache } from '@/cache.js';
import { mainRouter } from '@/router.js';
import { genEmbedCode } from '@/utility/get-embed-code.js';
import { prefer } from '@/preferences.js';
import { getPluginHandlers } from '@/plugin.js';
import { openShareDialog } from '@/utility/share-dialog.js';
import { globalEvents } from '@/events.js';
import { getUserBlockingState, updateUserBlocking } from '@/utility/user-blocking.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import { editUserMemo } from '@/utility/user-memo.js';

export function getUserMenu(user: Misskey.entities.UserDetailed, router: Router = mainRouter) {
	const meId = $i ? $i.id : null;
	user.isBlocking = getUserBlockingState(user.id) ?? user.isBlocking;

	const cleanups = [] as (() => void)[];

	// 菜单关闭后看不到状态变化，需要成功提示；失败提示由 apiWithDialog 处理
	async function toggleMute() {
		if (user.isMuted) {
			os.apiWithDialog('mute/delete', {
				userId: user.id,
			}).then(() => {
				user.isMuted = false;
				os.toast(i18n.ts.unmuted, 'success');
			}, () => {});
		} else {
			const { canceled, result: period } = await os.select({
				title: i18n.ts.mutePeriod,
				items: [{
					value: 'indefinitely', label: i18n.ts.indefinitely,
				}, {
					value: 'tenMinutes', label: i18n.ts.tenMinutes,
				}, {
					value: 'oneHour', label: i18n.ts.oneHour,
				}, {
					value: 'oneDay', label: i18n.ts.oneDay,
				}, {
					value: 'oneWeek', label: i18n.ts.oneWeek,
				}],
				default: 'indefinitely',
			});
			if (canceled) return;

			const expiresAt = period === 'indefinitely' ? null
				: period === 'tenMinutes' ? Date.now() + (1000 * 60 * 10)
				: period === 'oneHour' ? Date.now() + (1000 * 60 * 60)
				: period === 'oneDay' ? Date.now() + (1000 * 60 * 60 * 24)
				: period === 'oneWeek' ? Date.now() + (1000 * 60 * 60 * 24 * 7)
				: null;

			os.apiWithDialog('mute/create', {
				userId: user.id,
				expiresAt,
			}).then(() => {
				user.isMuted = true;
				os.toast(i18n.ts.muted, 'success');
			}, () => {});
		}
	}

	async function toggleRenoteMute() {
		os.apiWithDialog(user.isRenoteMuted ? 'renote-mute/delete' : 'renote-mute/create', {
			userId: user.id,
		}).then(() => {
			user.isRenoteMuted = !user.isRenoteMuted;
			os.toast(user.isRenoteMuted ? i18n.ts.renoteMuted : i18n.ts.renoteUnmuted, 'success');
		}, () => {});
	}

	let changingBlock = false;

	async function toggleBlock() {
		if (changingBlock) return;
		changingBlock = true;
		try {
			const blocking = !(getUserBlockingState(user.id) ?? user.isBlocking);
			if (!await getConfirmed(blocking ? i18n.ts.blockConfirm : i18n.ts.unblockConfirm)) return;
			await os.apiWithDialog(blocking ? 'blocking/create' : 'blocking/delete', { userId: user.id });
			user.isBlocking = blocking;
			updateUserBlocking(user.id, blocking);
			os.toast(blocking ? i18n.ts.youBlockedThisUser : i18n.ts.unblocked, 'success');
		} catch {
			// 接口已提示错误，失败时保留拉黑状态。
		} finally {
			changingBlock = false;
		}
	}

	async function toggleNotify() {
		os.apiWithDialog('following/update', {
			userId: user.id,
			notify: user.notify === 'normal' ? 'none' : 'normal',
		}).then(() => {
			user.notify = user.notify === 'normal' ? 'none' : 'normal';
			os.toast(user.notify === 'normal' ? i18n.ts.notifyNotesEnabled : i18n.ts.notifyNotesDisabled, 'success');
		}, () => {});
	}

	async function getConfirmed(text: string): Promise<boolean> {
		const confirm = await os.confirm({
			type: 'warning',
			title: i18n.ts.areYouSure,
			text,
		});

		return !confirm.canceled;
	}

	async function userInfoUpdate() {
		os.apiWithDialog('federation/update-remote-user', {
			userId: user.id,
		}).then(() => {
			os.toast(i18n.ts.updated, 'success');
		}, () => {});
	}

	async function invalidateFollow() {
		if (!await getConfirmed(i18n.ts.breakFollowConfirm)) return;

		os.apiWithDialog('following/invalidate', {
			userId: user.id,
		}).then(() => {
			user.isFollowed = !user.isFollowed;
			os.toast(i18n.ts.followerRemoved, 'success');
		}, () => {});
	}

	async function editMemo(): Promise<void> {
		let userDetailed: Misskey.entities.UserDetailed;
		try {
			userDetailed = await misskeyApi('users/show', {
				userId: user.id,
			});
		} catch (error) {
			if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
			return;
		}

		const memo = await editUserMemo(user.id, userDetailed.memo);
		if (memo != null) user.memo = memo;
	}

	const menuItems: MenuItem[] = [];

	if (iAmModerator) {
		menuItems.push({
			icon: 'ti ti-user-exclamation',
			text: i18n.ts.moderation,
			action: () => {
				router.push('/admin/user/:userId', {
					params: {
						userId: user.id,
					},
				});
			},
		}, { type: 'divider' });
	}

	menuItems.push({
		icon: 'ti ti-at',
		text: i18n.ts.copyUsername,
		action: () => {
			copyToClipboard(`@${user.username}@${user.host ?? host}`);
		},
	});

	menuItems.push({
		icon: 'ti ti-link',
		text: i18n.ts.copyProfileUrl,
		action: () => {
			const canonical = user.host === null ? `@${user.username}` : `@${user.username}@${toUnicode(user.host)}`;
			copyToClipboard(`${url}/${canonical}`);
		},
	});
	menuItems.push({
		icon: 'ti ti-share',
		text: i18n.ts.share,
		action: () => {
			const canonical = user.host === null ? `@${user.username}` : `@${user.username}@${toUnicode(user.host)}`;
			openShareDialog({ title: user.name ?? user.username, url: `${url}/${canonical}` });
		},
	});

	menuItems.push({
		icon: 'ti ti-rss',
		text: i18n.ts.copyRSS,
		action: () => {
			copyToClipboard(`${user.host ?? host}/@${user.username}.atom`);
		},
	});

	menuItems.push({
		icon: 'ti ti-qrcode',
		text: i18n.ts._qr.showUser,
		action: () => {
			const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUserQrDialog.vue')), { user }, {
				closed: () => dispose(),
			});
		},
	});

	if (user.host != null && user.url != null) {
		menuItems.push({
			icon: 'ti ti-external-link',
			text: i18n.ts.showOnRemote,
			action: () => {
				if (user.url == null) return;
				window.open(user.url, '_blank', 'noopener');
			},
		});
	} else {
		menuItems.push({
			icon: 'ti ti-code',
			text: i18n.ts.embed,
			type: 'parent',
			children: [{
				text: i18n.ts.noteOfThisUser,
				action: () => {
					genEmbedCode('user-timeline', user.id);
				},
			}], // TODO: ユーザーカードの埋め込みなど
		});
	}

	if ($i && meId === user.id) {
		menuItems.push({
			icon: 'ti ti-qrcode',
			text: i18n.ts.qr,
			action: () => {
				router.push('/qr');
			},
		});
	}

	if (notesSearchAvailable.value && (user.host == null || canSearchNonLocalNotes)) {
		menuItems.push({
			icon: 'ti ti-search',
			text: i18n.ts.searchThisUsersNotes,
			action: () => {
				const query = {
						username: user.username,
						type: 'note',
					} as { username: string, type: string, host?: string };

				if (user.host !== null) {
					query.host = user.host;
				}

				router.push('/search', {
					query
				});
			},
		});
	}

	if ($i) {
		menuItems.push({ type: 'divider' }, {
			icon: 'ti ti-pencil',
			text: i18n.ts.editMemo,
			action: editMemo,
		}, {
			type: 'parent',
			icon: 'ti ti-users-group',
			text: i18n.ts.addToList,
			children: async () => {
				const lists = await userListsCache.fetch();
				return lists.map(list => {
					const isListed = ref(list.userIds?.includes(user.id) ?? false);
					// 开关成功不提示；失败时由 apiWithDialog 提示，并还原开关
					let reverting = false;
					const revert = () => {
						reverting = true;
						isListed.value = !isListed.value;
					};
					cleanups.push(watch(isListed, () => {
						if (reverting) {
							reverting = false;
							return;
						}
						if (isListed.value) {
							os.apiWithDialog('users/lists/push', {
								listId: list.id,
								userId: user.id,
							}).then(() => {
								list.userIds?.push(user.id);
							}, revert);
						} else {
							os.apiWithDialog('users/lists/pull', {
								listId: list.id,
								userId: user.id,
							}).then(() => {
								list.userIds?.splice(list.userIds.indexOf(user.id), 1);
							}, revert);
						}
					}));

					return {
						type: 'switch',
						text: list.name,
						ref: isListed,
					};
				});
			},
		}, {
			type: 'parent',
			icon: 'ti ti-rss',
			text: i18n.ts.addToAntenna,
			children: async () => {
				const antennas = await antennasCache.fetch();
				const canonical = user.host === null ? `@${user.username}` : `@${user.username}@${toUnicode(user.host)}`;
				return antennas.filter((a) => a.src === 'users').map(antenna => ({
					text: antenna.name,
					action: async () => {
						await os.apiWithDialog('antennas/update', {
							antennaId: antenna.id,
							name: antenna.name,
							keywords: antenna.keywords,
							excludeKeywords: antenna.excludeKeywords,
							src: antenna.src,
							userListId: antenna.userListId,
							users: [...antenna.users, canonical],
							caseSensitive: antenna.caseSensitive,
							withReplies: antenna.withReplies,
							withFile: antenna.withFile,
						});
						os.toast(i18n.ts.added, 'success');
						antennasCache.delete();
					},
				}));
			},
		});
	}

	if ($i && meId !== user.id) {
		if (iAmModerator) {
			menuItems.push({
				type: 'parent',
				icon: 'ti ti-badges',
				text: i18n.ts.roles,
				children: async () => {
					// 每次展开都读取最新的角色和对方当前的分配，结果因查看者和对象而异。
					const [roles, target] = await Promise.all([
						misskeyApi('admin/roles/list', { limit: 100 }),
						misskeyApi('admin/show-user', { userId: user.id }),
					]);
					const assignedRoleIds = new Set(target.roles.map(role => role.id));

					return roles.filter(r => r.target === 'manual').map(r => {
						const assigned = ref(assignedRoleIds.has(r.id));
						let reverting = false;
						const revert = () => {
							reverting = true;
							assigned.value = !assigned.value;
						};
						cleanups.push(watch(assigned, async value => {
							if (reverting) {
								reverting = false;
								return;
							}
							if (!value) {
								await os.apiWithDialog('admin/roles/unassign', { roleId: r.id, userId: user.id }).then(() => {
									globalEvents.emit('userRolesUpdated', user.id);
								}, revert);
								return;
							}
							const { canceled, result: period } = await os.select({
								title: i18n.ts.period + ': ' + r.name,
								items: [{
									value: 'indefinitely', label: i18n.ts.indefinitely,
								}, {
									value: 'oneHour', label: i18n.ts.oneHour,
								}, {
									value: 'oneDay', label: i18n.ts.oneDay,
								}, {
									value: 'oneWeek', label: i18n.ts.oneWeek,
								}, {
									value: 'oneMonth', label: i18n.ts.oneMonth,
								}],
								default: 'indefinitely',
							});
							if (canceled) return revert();

							const expiresAt = period === 'indefinitely' ? null
								: period === 'oneHour' ? Date.now() + (1000 * 60 * 60)
								: period === 'oneDay' ? Date.now() + (1000 * 60 * 60 * 24)
								: period === 'oneWeek' ? Date.now() + (1000 * 60 * 60 * 24 * 7)
								: period === 'oneMonth' ? Date.now() + (1000 * 60 * 60 * 24 * 30)
								: null;

							await os.apiWithDialog('admin/roles/assign', { roleId: r.id, userId: user.id, expiresAt }).then(() => {
								globalEvents.emit('userRolesUpdated', user.id);
							}, revert);
						}));

						// 与服务端规则一致：审核员只能调整允许审核员管理成员的角色。
						const editable = iAmAdmin || r.canEditMembersByModerator;
						return {
							type: 'switch' as const,
							text: r.name,
							ref: assigned,
							disabled: !editable,
							tooltip: editable ? undefined : i18n.ts._role.adminOnlyMembers,
						};
					});
				},
			});
		}

		// フォローしたとしても user.isFollowing はリアルタイム更新されないので不便なため
		//if (user.isFollowing) {
		const withRepliesRef = ref(user.withReplies ?? false);

		menuItems.push({
			type: 'switch',
			icon: 'ti ti-messages',
			text: i18n.ts.showRepliesToOthersInTimeline,
			ref: withRepliesRef,
		}, {
			icon: user.notify === 'none' ? 'ti ti-bell' : 'ti ti-bell-off',
			text: user.notify === 'none' ? i18n.ts.notifyNotes : i18n.ts.unnotifyNotes,
			action: toggleNotify,
		});

		// 开关成功不提示；失败时提示并还原开关
		let revertingWithReplies = false;
		cleanups.push(watch(withRepliesRef, (withReplies) => {
			if (revertingWithReplies) {
				revertingWithReplies = false;
				return;
			}
			misskeyApi('following/update', {
				userId: user.id,
				withReplies,
			}).then(() => {
				user.withReplies = withReplies;
			}, error => {
				if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
				revertingWithReplies = true;
				withRepliesRef.value = !withReplies;
			});
		}));
		//}

		menuItems.push({ type: 'divider' }, {
			icon: 'ti ti-pencil-heart',
			text: i18n.ts.createUserSpecifiedNote,
			action: () => {
				const canonical = user.host === null ? `@${user.username}` : `@${user.username}@${user.host}`;
				os.post({ specified: user, initialText: `${canonical} ` });
			},
		});

		if ($i.policies.chatAvailability === 'available' && user.canChat && user.host == null) {
			menuItems.push({
				type: 'link',
				icon: 'ti ti-message-circle',
				text: i18n.ts._chat.chatWithThisUser,
				to: `/chat/user/${user.id}`,
			});
		}

		menuItems.push({ type: 'divider' }, {
			icon: user.isMuted ? 'ti ti-eye' : 'ti ti-eye-off',
			text: user.isMuted ? i18n.ts.unmute : i18n.ts.mute,
			action: toggleMute,
		}, {
			icon: user.isRenoteMuted ? 'ti ti-repeat' : 'ti ti-repeat-off',
			text: user.isRenoteMuted ? i18n.ts.renoteUnmute : i18n.ts.renoteMute,
			action: toggleRenoteMute,
		}, {
			icon: 'ti ti-ban',
			text: user.isBlocking ? i18n.ts.unblock : i18n.ts.block,
			action: toggleBlock,
		});

		if (user.isFollowed) {
			menuItems.push({
				icon: 'ti ti-link-off',
				text: i18n.ts.breakFollow,
				action: invalidateFollow,
			});
		}

		menuItems.push({ type: 'divider' }, getAbuseReportMenu({ type: 'user', user }));
	}

	if ($i != null && user.host !== null) {
		menuItems.push({ type: 'divider' }, {
			icon: 'ti ti-refresh',
			text: i18n.ts.updateRemoteUser,
			action: userInfoUpdate,
		});
	}

	if (prefer.s.devMode) {
		menuItems.push({ type: 'divider' }, {
			icon: 'ti ti-hash',
			text: i18n.ts.copyUserId,
			action: () => {
				copyToClipboard(user.id);
			},
		});
	}

	if ($i && meId === user.id) {
		menuItems.push({ type: 'divider' }, {
			icon: 'ti ti-pencil',
			text: i18n.ts.editProfile,
			action: () => {
				router.push('/settings/profile');
			},
		});
	}

	const userActions = getPluginHandlers('user_action');
	if (userActions.length > 0) {
		menuItems.push({ type: 'divider' }, ...userActions.map(action => ({
			icon: 'ti ti-plug',
			text: action.title,
			action: () => {
				action.handler(user);
			},
		})));
	}

	return {
		menu: menuItems,
		cleanup: () => {
			if (_DEV_) console.log('user menu cleanup', cleanups);
			for (const cl of cleanups) {
				cl();
			}
		},
	};
}
