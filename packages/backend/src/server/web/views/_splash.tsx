/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function Splash(props: {
	icon?: string | null;
}) {
	const icon = props.icon?.trim() || '/static-assets/splash.png';

	return (
		<div id="splash">
			<div id="splashLoader" class="with-icon">
				<img id="splashIcon" src={icon} alt="" width="250" height="150" />
				<div id="splashSpinner" aria-hidden="true">
					<span class="dot" style="--n:-2;"></span>
					<span class="dot" style="--n:-1;"></span>
					<span class="dot" style="--n:0;"></span>
					<span class="dot" style="--n:1;"></span>
					<span class="dot" style="--n:2;"></span>
				</div>
			</div>
		</div>
	);
}
