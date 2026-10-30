/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// NIRAX --- A lightweight router

import { computed, onBeforeUnmount, shallowRef } from 'vue';
import { EventEmitter } from 'eventemitter3';
import { safeURIDecode } from '@@/js/url.js';
import { createPageHistoryEntryId } from '@/utility/page-history.js';
import type { Component, ComputedRef, ShallowRef } from 'vue';

interface RouteDefBase {
	path: string;
	query?: Record<string, string>;
	/** 这些参数变化时复用页面；页面需响应其更新，其余参数继续区分实例。 */
	reuseOnPropsChange?: readonly string[];
	/** 当前路由最终渲染的是 not-found 页面。 */
	notFound?: boolean;
	loginRequired?: boolean;
	name?: string;
	hash?: string;
	children?: RouteDef[];
}

interface RouteDefWithComponent extends RouteDefBase {
	component: Component,
}

interface RouteDefWithRedirect extends RouteDefBase {
	redirect: string | ((props: Map<string, string | boolean>) => string);
}

export type RouteDef = RouteDefWithComponent | RouteDefWithRedirect;

export type RouterFlag = 'forcePage';

export type NavigationType = 'initial' | 'push' | 'replace' | 'traverse';

export type NavigationState = {
	type: NavigationType;
	entryId: string;
};

export type NavigationContext = {
	beforeFullPath: string;
	fullPath: string;
	resolved: PathResolvedResult;
	beforeNavigation: NavigationState;
	navigation: NavigationState;
};

type ParsedPath = (string | {
	name: string;
	startsWith?: string;
	wildcard?: boolean;
	optional?: boolean;
})[];

export type RouterEvents = {
	/** 在切换路由或页面状态前保存离开页面，避免 change 中的归顶覆盖原位置。 */
	'before-change': (ctx: NavigationContext) => void;
	/** ページ内遷移を検知した場合（analytics用） */
	change: (ctx: NavigationContext) => void;
	/** history stateのreplaceを行う場合 */
	replace: (ctx: {
		fullPath: string;
		navigation: NavigationState;
	}) => void;
	/** location.replace相当の処理が必要な場合 */
	forceReplace: (ctx: {
		onInit: boolean;
		fullPath: string;
	}) => void;
	/** history stateのpushを行う場合 */
	push: (ctx: {
		beforeFullPath: string;
		fullPath: string;
		route: RouteDef | null;
		props: Map<string, string | boolean> | null;
		navigation: NavigationState;
	}) => void;
	/** location.hrefへの代入相当の処理が必要な場合 */
	forcePush: (ctx: {
		onInit: boolean;
		fullPath: string;
	}) => void;
	/** 遷移先が現在のページと同じだった場合 */
	same: () => void;
};

export type PathResolvedResult = {
	route: RouteDef;
	props: Map<string, string | boolean>;
	child?: PathResolvedResult;
	redirected?: boolean;

	/** @internal */
	_parsedRoute: {
		fullPath: string;
		queryString: string | null;
		hash: string | null;
	};
};

export type RouteHistoryEntry = {
	entryId: string;
	resolved: PathResolvedResult;
};

export function getRouteViewKey(resolved: PathResolvedResult, entryId: string): string {
	if (resolved.child) {
		// 父布局只按自身身份复用，子路由变化不能重建菜单或头像。
		return JSON.stringify([resolved.route.path, [...resolved.props].sort(([a], [b]) => a.localeCompare(b))]);
	}
	const reusableProps = resolved.route.reuseOnPropsChange;
	if (!reusableProps) return JSON.stringify([resolved._parsedRoute.fullPath.split('#')[0], entryId]);
	const identityProps = [...resolved.props].filter(([name]) => !reusableProps.includes(name));
	identityProps.sort(([a], [b]) => a.localeCompare(b));
	return JSON.stringify([resolved.route.path, identityProps]);
}

//#region Path Types
type Prettify<T> = {
	[K in keyof T]: T[K]
} & {};

type RemoveNever<T> = {
	[K in keyof T as T[K] extends never ? never : K]: T[K];
} & {};

type IsPathParameter<Part extends string> = Part extends `${string}:${infer Parameter}` ? Parameter : never;

type GetPathParamKeys<Path extends string> =
	Path extends `${infer A}/${infer B}`
		? IsPathParameter<A> | GetPathParamKeys<B>
		: IsPathParameter<Path>;

type GetPathParams<Path extends string> = Prettify<{
	[Param in GetPathParamKeys<Path> as Param extends `${string}?` ? never : Param]: string;
} & {
	[Param in GetPathParamKeys<Path> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string;
}>;

type UnwrapReadOnly<T> = T extends ReadonlyArray<infer U>
	? U
	: T extends Readonly<infer U>
		? U
		: T;

type GetPaths<Def extends RouteDef> = Def extends { path: infer Path }
	? Path extends string
		? Def extends { children: infer Children }
			? Children extends RouteDef[]
				? Path | `${Path extends '/' ? '' : Path}${FlattenAllPaths<Children>}`
				: Path
			: Path
		: never
	: never;

type FlattenAllPaths<Defs extends RouteDef[]> = GetPaths<Defs[number]>;

type GetSinglePathQuery<Def extends RouteDef, Path extends FlattenAllPaths<RouteDef[]>> = RemoveNever<
	Def extends { path: infer BasePath, children: infer Children }
		? BasePath extends string
			? Path extends `${BasePath extends '/' ? '' : BasePath}${infer ChildPath}`
				? Children extends RouteDef[]
					? ChildPath extends FlattenAllPaths<Children>
						? GetPathQuery<Children, ChildPath>
						: Record<string, never>
					: never
				: never
			: never
		: Def['path'] extends Path
			? Def extends { query: infer Query }
				? Query extends Record<string, string>
					? UnwrapReadOnly<{ [Key in keyof Query]?: string; }>
					: Record<string, never>
				: Record<string, never>
			: Record<string, never>
>;

type GetPathQuery<Defs extends RouteDef[], Path extends FlattenAllPaths<Defs>> = GetSinglePathQuery<Defs[number], Path>;

type RequiredIfNotEmpty<K extends string, T extends Record<string, unknown>> = T extends Record<string, never>
	? { [Key in K]?: T }
	: { [Key in K]: T };

type NotRequiredIfEmpty<T extends Record<string, unknown>> = T extends Record<string, never> ? T | undefined : T;

type GetRouterOperationProps<Defs extends RouteDef[], Path extends FlattenAllPaths<Defs>> = NotRequiredIfEmpty<RequiredIfNotEmpty<'params', GetPathParams<Path>> & {
	query?: GetPathQuery<Defs, Path>;
	hash?: string;
}>;
//#endregion

function buildFullPath(args: {
	path: string;
	params?: Record<string, string>;
	query?: Record<string, string>;
	hash?: string;
}) {
	let fullPath = args.path;

	if (args.params) {
		for (const key in args.params) {
			const value = args.params[key];
			const replaceRegex = new RegExp(`:${key}(\\?)?`, 'g');
			fullPath = fullPath.replace(replaceRegex, value ? encodeURIComponent(value) : '');
		}
		// remove any optional parameters that are not provided
		fullPath = fullPath.replace(/\/:\w+\?(?=\/|$)/g, '');
	}

	if (args.query) {
		const queryString = new URLSearchParams(args.query).toString();
		if (queryString) {
			fullPath += '?' + queryString;
		}
	}

	if (args.hash) {
		fullPath += '#' + encodeURIComponent(args.hash);
	}

	return fullPath;
}

function parsePath(path: string): ParsedPath {
	const res = [] as ParsedPath;

	path = path.substring(1);

	for (const part of path.split('/')) {
		if (part.includes(':')) {
			const prefix = part.substring(0, part.indexOf(':'));
			const placeholder = part.substring(part.indexOf(':') + 1);
			const wildcard = placeholder.includes('(*)');
			const optional = placeholder.endsWith('?');
			res.push({
				name: placeholder.replace('(*)', '').replace('?', ''),
				startsWith: prefix !== '' ? prefix : undefined,
				wildcard,
				optional,
			});
		} else if (part.length !== 0) {
			res.push(part);
		}
	}

	return res;
}

export class Nirax<DEF extends RouteDef[]> extends EventEmitter<RouterEvents> {
	private routes: DEF;
	public current: PathResolvedResult;
	public currentRef: ShallowRef<PathResolvedResult>;
	public currentRoute: ShallowRef<RouteDef>;
	public navigationRef: ShallowRef<NavigationState>;
	public historyRef: ShallowRef<readonly RouteHistoryEntry[]>;
	public historyIndexRef: ShallowRef<number>;
	public canGoBack: ComputedRef<boolean>;
	public historyTraversal: ((delta: -1 | 1) => void) | null = null;
	private currentFullPath: string; // /foo/bar?baz=qux#hash
	private isLoggedIn: boolean;
	private notFoundPageComponent: Component;

	public navHook: ((fullPath: string, flag?: RouterFlag) => boolean) | null = null;
	public beforeLeave: (() => boolean | Promise<boolean>) | null = null;
	public canNavigate: (() => boolean) | null = null;
	private leaveDecision: Promise<boolean> | null = null;
	private navigationAttempt = 0;

	constructor(routes: DEF, currentFullPath: Nirax<DEF>['currentFullPath'], isLoggedIn: boolean, notFoundPageComponent: Component, initialEntryId = createPageHistoryEntryId()) {
		super();

		this.routes = routes;
		this.current = this.resolve(currentFullPath)!;
		this.currentRef = shallowRef(this.current);
		this.currentRoute = shallowRef(this.current.route);
		this.currentFullPath = currentFullPath;
		this.isLoggedIn = isLoggedIn;
		this.notFoundPageComponent = notFoundPageComponent;
		this.navigationRef = shallowRef<NavigationState>({ type: 'initial', entryId: initialEntryId });
		this.historyRef = shallowRef([{ entryId: initialEntryId, resolved: this.current }]);
		this.historyIndexRef = shallowRef(0);
		this.canGoBack = computed(() => this.historyIndexRef.value > 0);
	}

	public init(triggerForceReplace = false) {
		const res = this.resolveForNavigation(this.currentFullPath);

		if (triggerForceReplace && res.route.path === '/:(*)') {
			this.emit('forceReplace', {
				onInit: true,
				fullPath: res._parsedRoute.fullPath,
			});
		}

		const navigation: NavigationState = { type: 'initial', entryId: this.navigationRef.value.entryId };
		this.navigate(res, navigation, false);
		this.emit('replace', {
			fullPath: res._parsedRoute.fullPath,
			navigation,
		});
	}

	public resolve(fullPath: string): PathResolvedResult | null {
		let path = fullPath;
		let queryString: string | null = null;
		let hash: string | null = null;
		if (path[0] === '/') path = path.substring(1);
		if (path.includes('#')) {
			hash = path.substring(path.indexOf('#') + 1);
			path = path.substring(0, path.indexOf('#'));
		}
		if (path.includes('?')) {
			queryString = path.substring(path.indexOf('?') + 1);
			path = path.substring(0, path.indexOf('?'));
		}

		const _parsedRoute = {
			fullPath,
			queryString,
			hash,
		};

		function check(routes: RouteDef[], _parts: string[]): PathResolvedResult | null {
			forEachRouteLoop:
			for (const route of routes) {
				let parts = [..._parts];
				const props = new Map<string, string>();

				pathMatchLoop:
				for (const p of parsePath(route.path)) {
					if (typeof p === 'string') {
						if (p === parts[0]) {
							parts.shift();
						} else {
							continue forEachRouteLoop;
						}
					} else {
						if (parts[0] == null && !p.optional) {
							continue forEachRouteLoop;
						}
						if (p.wildcard) {
							if (parts.length !== 0) {
								props.set(p.name, safeURIDecode(parts.join('/')));
								parts = [];
							}
							break pathMatchLoop;
						} else {
							if (p.startsWith) {
								if (parts[0] == null || !parts[0].startsWith(p.startsWith)) continue forEachRouteLoop;

								props.set(p.name, safeURIDecode(parts[0].substring(p.startsWith.length)));
								parts.shift();
							} else {
								if (parts[0]) {
									props.set(p.name, safeURIDecode(parts[0]));
								}
								parts.shift();
							}
						}
					}
				}

				if (parts.length === 0) {
					if (route.children) {
						const child = check(route.children, []);
						if (child) {
							return {
								route,
								props,
								child,
								_parsedRoute,
							};
						} else {
							continue forEachRouteLoop;
						}
					}

					if (route.hash != null && hash != null) {
						props.set(route.hash, safeURIDecode(hash));
					}

					if (route.query != null && queryString != null) {
						const queryObject = [...new URLSearchParams(queryString).entries()]
							.reduce((obj, entry) => ({ ...obj, [entry[0]]: entry[1] }), {}) as Record<string, string>;

						for (const q in route.query) {
							const as = route.query[q];
							if (queryObject[q] != null) {
								props.set(as, safeURIDecode(queryObject[q]));
							}
						}
					}

					return {
						route,
						props,
						_parsedRoute,
					};
				} else {
					if (route.children) {
						const child = check(route.children, parts);
						if (child) {
							return {
								route,
								props,
								child,
								_parsedRoute,
							};
						} else {
							continue forEachRouteLoop;
						}
					} else {
						continue forEachRouteLoop;
					}
				}
			}

			return null;
		}

		const _parts = path.split('/').filter(part => part.length !== 0);

		return check(this.routes, _parts);
	}

	/** 通常のresolve + リダイレクト解決 */
	private resolveForNavigation(fullPath: string, _redirectCount = 0): PathResolvedResult {
		const res = this.resolve(fullPath);

		if (res == null) {
			throw new Error('no route found for: ' + fullPath);
		}

		for (let current: PathResolvedResult | undefined = res; current != null; current = current.child) {
			if ('redirect' in current.route) {
				let redirectPath: string;
				if (typeof current.route.redirect === 'function') {
					redirectPath = current.route.redirect(current.props);
				} else {
					redirectPath = current.route.redirect + (current._parsedRoute.queryString ? '?' + current._parsedRoute.queryString : '') + (current._parsedRoute.hash ? '#' + current._parsedRoute.hash : '');
				}
				if (_DEV_) console.log('Redirecting from', current._parsedRoute.fullPath, 'to', redirectPath);
				if (_redirectCount > 10) {
					throw new Error('redirect loop detected');
				}
				return this.resolveForNavigation(redirectPath, _redirectCount + 1);
			}
		}

		return {
			...res,
			redirected: _redirectCount > 0,
		};
	}

	/** 解決された`res`に応じてrouterの状態を更新する。 */
	private navigate(res: PathResolvedResult, navigation: NavigationState, emitChange = true) {
		const beforeFullPath = this.currentFullPath;

		if (res.route.loginRequired && !this.isLoggedIn && 'component' in res.route) {
			res.route.component = this.notFoundPageComponent;
			res.route.notFound = true;
			res.props.set('showLoginPopup', true);
		}

		const context: NavigationContext = {
			beforeFullPath,
			fullPath: res._parsedRoute.fullPath,
			resolved: res,
			beforeNavigation: this.navigationRef.value,
			navigation,
		};
		if (emitChange) this.emit('before-change', context);
		this.currentFullPath = res._parsedRoute.fullPath;
		this.navigationRef.value = navigation;
		const entry = { entryId: navigation.entryId, resolved: res };
		if (navigation.type === 'push') {
			this.historyRef.value = [...this.historyRef.value.slice(0, this.historyIndexRef.value + 1), entry];
			this.historyIndexRef.value = this.historyRef.value.length - 1;
		} else if (navigation.type === 'traverse') {
			const index = this.historyRef.value.findIndex(item => item.entryId === navigation.entryId);
			if (index === -1) {
				// 刷新后访问此前的浏览器历史项，从该项重新建立本次会话的导航记录。
				this.historyRef.value = [entry];
				this.historyIndexRef.value = 0;
			} else {
				this.historyIndexRef.value = index;
				this.historyRef.value = this.historyRef.value.map((item, i) => i === index ? entry : item);
			}
		} else {
			this.historyRef.value = this.historyRef.value.map((item, i) => i === this.historyIndexRef.value ? entry : item);
		}
		this.current = res;
		this.currentRef.value = res;
		this.currentRoute.value = res.route;

		if (emitChange && res.route.path !== '/:(*)') {
			this.emit('change', context);
		}

		return res;
	}

	public getCurrentFullPath() {
		return this.currentFullPath;
	}

	public back() {
		this.traverseHistory(-1);
	}

	public forward() {
		this.traverseHistory(1);
	}

	private traverseHistory(delta: -1 | 1) {
		if (this.historyTraversal) {
			this.historyTraversal(delta);
			return;
		}
		const entry = this.historyRef.value[this.historyIndexRef.value + delta];
		if (entry) this.traverseByPath(entry.resolved._parsedRoute.fullPath, entry.entryId);
	}

	public push<P extends FlattenAllPaths<DEF>>(path: P, props?: GetRouterOperationProps<DEF, P>, flag?: RouterFlag | null) {
		const fullPath = buildFullPath({
			path,
			params: props?.params,
			query: props?.query,
			hash: props?.hash,
		});
		this.pushByPath(fullPath, flag);
	}

	public replace<P extends FlattenAllPaths<DEF>>(path: P, props?: GetRouterOperationProps<DEF, P>) {
		const fullPath = buildFullPath({
			path,
			params: props?.params,
			query: props?.query,
			hash: props?.hash,
		});
		this.replaceByPath(fullPath);
	}

	/** どうしても必要な場合に使用（パスが確定している場合は `Nirax.push` を使用すること） */
	public pushByPath(fullPath: string, flag?: RouterFlag | null) {
		const beforeFullPath = this.currentFullPath;
		if (fullPath === beforeFullPath) {
			this.emit('same');
			return;
		}
		if (this.navHook) {
			const cancel = this.navHook(fullPath, flag ?? undefined);
			if (cancel) return;
		}
		this.guardNavigation(() => this.pushResolvedPath(fullPath));
	}

	private guardNavigation(navigate: () => void) {
		if (this.canNavigate?.() === false) return;
		const attempt = ++this.navigationAttempt;
		const sourceId = this.navigationRef.value.entryId;
		const commit = () => {
			if (attempt === this.navigationAttempt && sourceId === this.navigationRef.value.entryId && this.canNavigate?.() !== false) navigate();
		};
		const allowed = this.checkBeforeLeave();
		if (typeof allowed === 'boolean') {
			if (allowed) commit();
			return;
		}
		void allowed.then(result => { if (result) commit(); });
	}

	public cancelPendingNavigation() {
		this.navigationAttempt++;
	}

	public checkBeforeLeave(): boolean | Promise<boolean> {
		if (this.leaveDecision) return this.leaveDecision;
		const guard = this.beforeLeave;
		if (!guard) return true;
		const sourceId = this.navigationRef.value.entryId;
		const allowed = guard();
		if (typeof allowed === 'boolean') return allowed;
		const decision = allowed.then(result => result && sourceId === this.navigationRef.value.entryId && guard === this.beforeLeave)
			.catch(error => { console.error('Failed to check navigation', error); return false; })
			.finally(() => { if (this.leaveDecision === decision) this.leaveDecision = null; });
		this.leaveDecision = decision;
		return decision;
	}

	private pushResolvedPath(fullPath: string) {
		const beforeFullPath = this.currentFullPath;
		const res = this.resolveForNavigation(fullPath);
		if (res.route.path === '/:(*)') {
			this.emit('forcePush', {
				fullPath: res._parsedRoute.fullPath,
				onInit: false,
			});
		} else {
			const navigation: NavigationState = { type: 'push', entryId: createPageHistoryEntryId() };
			this.navigate(res, navigation);
			this.emit('push', {
				beforeFullPath,
				fullPath: res._parsedRoute.fullPath,
				route: res.route,
				props: res.props,
				navigation,
			});
		}
	}

	/** どうしても必要な場合に使用（パスが確定している場合は `Nirax.replace` を使用すること） */
	public replaceByPath(fullPath: string) {
		if (fullPath !== this.currentFullPath) {
			this.guardNavigation(() => this.replaceResolvedPath(fullPath));
		} else {
			this.replaceResolvedPath(fullPath);
		}
	}

	private replaceResolvedPath(fullPath: string) {
		const res = this.resolveForNavigation(fullPath);
		if (res.route.path === '/:(*)') {
			this.emit('forceReplace', {
				fullPath: res._parsedRoute.fullPath,
				onInit: false,
			});
		} else {
			const entryId = res._parsedRoute.fullPath === this.currentFullPath ? this.navigationRef.value.entryId : createPageHistoryEntryId();
			const navigation: NavigationState = { type: 'replace', entryId };
			this.navigate(res, navigation);
			this.emit('replace', {
				fullPath: res._parsedRoute.fullPath,
				navigation,
			});
		}
	}

	/** 浏览器前进后退保留原历史项；不能当作普通 replace 新建页面状态。 */
	public traverseByPath(fullPath: string, entryId: string, skipLeaveGuard = false) {
		if (!skipLeaveGuard && entryId !== this.navigationRef.value.entryId) {
			this.guardNavigation(() => this.traverseByPath(fullPath, entryId, true));
			return;
		}
		const res = this.resolveForNavigation(fullPath);
		if (res.route.path === '/:(*)') {
			this.emit('forceReplace', { fullPath: res._parsedRoute.fullPath, onInit: false });
			return;
		}
		const navigation: NavigationState = { type: 'traverse', entryId };
		this.navigate(res, navigation);
		if (res.redirected) {
			this.emit('replace', { fullPath: res._parsedRoute.fullPath, navigation });
		}
	}

	public useListener<E extends keyof RouterEvents>(event: E, listener: EventEmitter.EventListener<RouterEvents, E>) {
		this.addListener(event, listener);

		onBeforeUnmount(() => {
			this.removeListener(event, listener);
		});
	}
}
