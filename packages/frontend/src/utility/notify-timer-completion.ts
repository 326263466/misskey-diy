/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';
import { confetti } from '@/utility/confetti.js';
import { playMisskeySfx } from '@/utility/sound.js';

export function notifyTimerCompletion(title: string, text: string): void {
	os.alert({ type: 'success', title, text });
	confetti({ duration: 3000 });
	playMisskeySfx('notification');
}
