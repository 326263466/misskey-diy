/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EntityManager, Repository } from 'typeorm';
import { MiNote } from '@/models/Note.js';
import type { GlobalEventService } from '@/core/GlobalEventService.js';

export async function getNoteReplyAncestors(notesRepository: Repository<MiNote>, replyId: string): Promise<MiNote[]> {
	const rows = await notesRepository.query<MiNote[]>(`
		WITH RECURSIVE ancestors AS (
			SELECT id, "replyId" FROM note WHERE id = $1
			UNION
			SELECT n.id, n."replyId" FROM note n INNER JOIN ancestors a ON n.id = a."replyId"
		)
		SELECT n.* FROM note n INNER JOIN ancestors a ON n.id = a.id
	`, [replyId]);
	return rows.map(row => notesRepository.create(row));
}

export async function lockNoteReplyAncestors(transaction: EntityManager, noteId: string): Promise<MiNote[]> {
	const repository = transaction.getRepository(MiNote);
	const ancestors = await getNoteReplyAncestors(repository, noteId);
	if (ancestors.length === 0) return [];
	// 创建和删除按相同顺序锁定父级，防止并发回复造成计数或关联错乱。
	const rows = await transaction.query<MiNote[]>('SELECT * FROM note WHERE id = ANY($1::varchar[]) ORDER BY id FOR UPDATE', [ancestors.map(note => note.id)]);
	return rows.map(row => repository.create(row));
}

export async function notifyNoteReplied(notesRepository: Repository<MiNote>, events: GlobalEventService, note: MiNote): Promise<void> {
	if (note.replyId == null) return;
	for (const ancestor of await getNoteReplyAncestors(notesRepository, note.replyId)) {
		if (ancestor.id !== note.replyId) events.publishNoteStream(ancestor, 'replied', { noteId: note.id });
	}
}
