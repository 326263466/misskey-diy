/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const palettes = [
	{ paper: '#091B43', ink: '#F6EED7', accent: '#164CF0', accentInk: '#F6EED7' },
	{ paper: '#F5EEDF', ink: '#191E18', accent: '#DE460B', accentInk: '#FFF3DA' },
	{ paper: '#171C13', ink: '#F4F0DA', accent: '#CDF30A', accentInk: '#11170B' },
	{ paper: '#251039', ink: '#F7ECD5', accent: '#701EE8', accentInk: '#F7ECD5' },
	{ paper: '#102D24', ink: '#F5EBD4', accent: '#087A58', accentInk: '#F5EBD4' },
	{ paper: '#F3EBD8', ink: '#142441', accent: '#183B78', accentInk: '#F3EBD8' },
	{ paper: '#48141C', ink: '#F5EBD7', accent: '#BE2637', accentInk: '#F5EBD7' },
	{ paper: '#10262B', ink: '#EDF2DB', accent: '#A2D8BC', accentInk: '#122D29' },
] as const;

const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const displayFont = "Impact, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
const smallFont = "Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif";

function escapeXml(value: string): string {
	// 清除 XML 不接受的字符和孤立代理项，避免整张图片无法解码。
	return Array.from(value).filter(character => {
		const code = character.codePointAt(0)!;
		return code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000;
	}).join('').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

export function generateArticleCover(source: { title: string; createdAt: string; name: string; userId: string }): string {
	// 草稿和发布后都保留 name；标题或日期变化不会重新分配颜色。
	let hash = 2166136261;
	for (const character of `${source.userId}:${source.name}`) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
	const palette = palettes[(hash >>> 0) % palettes.length];
	const date = new Date(source.createdAt);
	const parts = Number.isNaN(date.getTime()) ? [] : dateFormatter.formatToParts(date);
	const year = parts.find(part => part.type === 'year')?.value ?? '----';
	const month = parts.find(part => part.type === 'month')?.value ?? '--';
	const day = parts.find(part => part.type === 'day')?.value ?? '--';
	const monthName = months[Number(month) - 1] ?? 'UNDATED';
	const titleCharacters = Array.from(source.title.replace(/\s+/gu, ' ').trim());
	const shortTitle = titleCharacters.length > 32 ? `${titleCharacters.slice(0, 31).join('')}…` : titleCharacters.join('');
	const title = escapeXml(shortTitle) || 'STORIES, IDEAS &amp; EVERYDAY LIFE';
	const titleWidth = Array.from(shortTitle).reduce((width, character) => width + (character.codePointAt(0)! > 0xff ? 29 : 17), 0);
	const titleFit = titleWidth > 650 ? 'textLength="650" lengthAdjust="spacingAndGlyphs"' : '';
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
	<title>${title} — ${year}.${month}.${day}</title>
	<defs><clipPath id="article-title"><rect x="38" y="587" width="656" height="62"/></clipPath></defs>
	<rect width="1200" height="800" fill="${palette.paper}"/>
	<rect x="732" width="468" height="800" fill="${palette.accent}"/>
	<g fill="${palette.ink}">
		<rect x="38" y="38" width="13" height="13"/>
		<text x="65" y="50" font-family="${smallFont}" font-size="13" font-weight="700" letter-spacing="2.2">THE EVERYDAY JOURNAL</text>
		<path d="M310 45H694M38 78H694" stroke="${palette.ink}" stroke-width="2"/>
		<g font-family="${displayFont}" font-weight="900">
			<text x="29" y="351" font-size="330" textLength="670" lengthAdjust="spacingAndGlyphs">DAILY</text>
			<text x="33" y="560" font-size="220" textLength="661" lengthAdjust="spacingAndGlyphs">EDITION</text>
		</g>
		<path d="M38 374H694M38 582H694" stroke="${palette.ink}" stroke-width="3"/>
		<text x="38" y="627" font-family="${smallFont}" font-size="29" font-weight="700" ${titleFit} clip-path="url(#article-title)">${title}</text>
		<text x="39" y="668" font-family="${smallFont}" font-size="13" letter-spacing="2.4">STORIES WORTH KEEPING.</text>
		<path d="M38 707H694" stroke="${palette.ink}" stroke-width="2"/>
		<g stroke="${palette.ink}">
			<path d="M39 724V761M48 724V761M68 724V761M84 724V761M102 724V761M112 724V761M137 724V761M156 724V761M167 724V761M187 724V761M205 724V761" stroke-width="3"/>
			<path d="M56 724V761M75 724V761M94 724V761M122 724V761M147 724V761M178 724V761M197 724V761" stroke-width="6"/>
		</g>
		<text x="229" y="739" font-family="${smallFont}" font-size="13" font-weight="700" letter-spacing="1.6">VOL. ${year}</text>
		<text x="229" y="760" font-family="${smallFont}" font-size="12" letter-spacing="1.4">${month}.${day} / DAILY ARCHIVE</text>
		<text x="694" y="751" text-anchor="end" font-family="${smallFont}" font-size="12" letter-spacing="1.5">A NEW PERSPECTIVE</text>
	</g>
	<g fill="${palette.accentInk}">
		<text x="770" y="50" font-family="${smallFont}" font-size="13" font-weight="700" letter-spacing="2">MONTH / DAY</text>
		<path d="M770 78H1162M770 390H1162M770 707H1162" stroke="${palette.accentInk}" stroke-width="2"/>
		<path d="M1124 51L1138 37M1136 51L1150 37M1148 51L1162 37" stroke="${palette.accentInk}" stroke-width="3"/>
		<g font-family="${displayFont}" font-weight="900">
			<text x="762" y="370" font-size="374" textLength="408" lengthAdjust="spacingAndGlyphs">${month}</text>
			<text x="762" y="685" font-size="374" textLength="408" lengthAdjust="spacingAndGlyphs">${day}</text>
		</g>
		<text x="770" y="752" font-family="${smallFont}" font-size="15" font-weight="700" letter-spacing="2">${monthName}</text>
		<text x="1162" y="756" text-anchor="end" font-family="${displayFont}" font-size="40" font-weight="900">${year}</text>
	</g>
</svg>`;
	return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export async function createArticleCoverFile(source: Parameters<typeof generateArticleCover>[0]): Promise<File> {
	const image = new Image();
	image.src = generateArticleCover(source);
	await image.decode();
	const canvas = window.document.createElement('canvas');
	canvas.width = 1200;
	canvas.height = 800;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas is unavailable');
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	// 保存为普通图片，上传、草稿恢复和封面替换沿用已有附件流程。
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(result => result ? resolve(result) : reject(new Error('Failed to render article cover')), 'image/png');
	});
	return new File([blob], 'article-cover.png', { type: 'image/png' });
}
