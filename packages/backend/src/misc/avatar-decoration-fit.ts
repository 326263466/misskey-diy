/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import sharp from 'sharp';

// 细线缩小后会变淡而漏检，按原尺寸分析，只限制特别大的图。
const ANALYSIS_WIDTH = 512;
const MAX_FRAMES = 60;
const OPAQUE_ALPHA = 48;
const ANGLE_BINS = 72;
// 只看头像边缘附近及以外的图案；画在脸上的装饰不影响空隙。
const INNER_LIMIT = 0.85;
// 按圆环带统计各方向是否有图案，带宽约为图宽的 1.5%，能容纳点状圆环的起伏。
const BAND_WIDTH = 0.015;
// 圆环（包括稀疏的点状、虚线圆环）至少覆盖这么多方向，并且不低于本帧最明显圆环的一半；
// 有明显圆环时，散落的气泡、星星达不到一半，不会被当成圆环。
const MIN_COVERAGE = 0.15;
const PEAK_RATIO = 0.5;
// 还要环绕大部分方位，耳朵、半圈弧线等只在局部的图案不处理。
const MIN_SECTORS = 6;
// 要缩到这个比例以下才能贴住头像的图案（如四角装饰、背景框）不是贴着头像设计的，不处理。
const MIN_SUGGESTED_SCALE = 0.6;
// 至少一半的帧里能找到圆环，才认为这是环形挂件。
const MIN_RING_FRAMES = 0.5;
// 空隙不到头像半径的这个比例时视为已贴合。
const FIT_TOLERANCE = 0.02;
// 缩小后让图案略微压住头像，避免抗锯齿留下细缝。
const OVERLAP = 0.02;

/**
 * 测量头像边缘到最内圈圆环之间的空隙，计算让圆环贴住头像的缩放。
 * 逐帧测量：闪烁、飘动的小装饰在合并后会填满空隙，单帧里不会。
 * 取最靠近头像的一帧，任何一帧都不会压到脸上。
 * 只缩小不放大：压住头像的相框通常是有意设计。无法判断时返回 null。
 */
export function suggestAvatarDecorationScale(frames: Uint8Array[], width: number, height: number): number | null {
	// 缩放以图片中心为原点，只有正方形图片缩放后圆心才不偏离头像中心。
	if (frames.length === 0 || width <= 0 || Math.abs(width - height) > width * 0.02) return null;

	// 挂件按头像的 200% 显示并上移、左移 50%，头像在图中居中且半径为宽度的 1/4。
	const avatarRadius = width / 4;
	const geometry = createGeometry(width, height, avatarRadius);
	const edges = frames.map(alpha => findRingEdge(alpha, geometry)).filter(edge => edge != null);
	if (edges.length < frames.length * MIN_RING_FRAMES) return null;

	const ratio = Math.min(...edges) / avatarRadius;
	if (ratio <= 1 + FIT_TOLERANCE) return 1;

	const scale = Math.round(((1 - OVERLAP) / ratio) * 100) / 100;
	return scale < MIN_SUGGESTED_SCALE ? null : scale;
}

type Geometry = {
	minRadius: number;
	radii: number;
	band: number;
	// 每个像素所在的半径（相对 minRadius）和方向；不参与统计的像素半径为 -1。
	pixelRadius: Int16Array;
	pixelBin: Uint8Array;
};

function createGeometry(width: number, height: number, avatarRadius: number): Geometry {
	const center = width / 2;
	const minRadius = Math.floor(avatarRadius * INNER_LIMIT);
	const radii = Math.ceil(Math.hypot(center, center)) - minRadius + 1;
	const pixelRadius = new Int16Array(width * height).fill(-1);
	const pixelBin = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		const dy = y + 0.5 - center;
		for (let x = 0; x < width; x++) {
			const dx = x + 0.5 - center;
			const r = Math.floor(Math.hypot(dx, dy)) - minRadius;
			if (r < 0 || r >= radii) continue;
			pixelRadius[y * width + x] = r;
			pixelBin[y * width + x] = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * ANGLE_BINS) % ANGLE_BINS;
		}
	}
	return { minRadius, radii, band: Math.max(2, Math.round(width * BAND_WIDTH)), pixelRadius, pixelBin };
}

/** 单帧里最内圈圆环的内缘到中心的距离；没有圆环时返回 null。 */
function findRingEdge(alpha: Uint8Array, { minRadius, radii, band, pixelRadius, pixelBin }: Geometry): number | null {
	// occupied[r * ANGLE_BINS + bin]：该半径、该方向上是否有图案。
	const occupied = new Uint8Array(radii * ANGLE_BINS);
	for (let i = 0; i < alpha.length; i++) {
		if (alpha[i] <= OPAQUE_ALPHA || pixelRadius[i] < 0) continue;
		occupied[pixelRadius[i] * ANGLE_BINS + pixelBin[i]] = 1;
	}

	// 每条圆环带覆盖的方向数。
	const coverage = new Float64Array(Math.max(0, radii - band + 1));
	for (let start = 0; start < coverage.length; start++) {
		let count = 0;
		for (let bin = 0; bin < ANGLE_BINS; bin++) {
			for (let r = start; r < start + band; r++) {
				if (occupied[r * ANGLE_BINS + bin] === 1) {
					count++;
					break;
				}
			}
		}
		coverage[start] = count / ANGLE_BINS;
	}

	const threshold = Math.max(MIN_COVERAGE, Math.max(0, ...coverage) * PEAK_RATIO);
	for (let start = 0; start < coverage.length; start++) {
		if (coverage[start] < threshold) continue;
		const edges: number[] = [];
		const sectors = new Set<number>();
		for (let bin = 0; bin < ANGLE_BINS; bin++) {
			for (let r = start; r < start + band; r++) {
				if (occupied[r * ANGLE_BINS + bin] === 0) continue;
				edges.push(r + minRadius + 0.5);
				sectors.add(Math.floor((bin * 8) / ANGLE_BINS));
				break;
			}
		}
		if (sectors.size < MIN_SECTORS) continue;
		// 各方向最靠内的图案取中位数，波浪形、点状圆环也能稳定。
		edges.sort((a, b) => a - b);
		return edges[Math.floor(edges.length / 2)];
	}
	return null;
}

/** 读取图片（动图读取全部帧），返回每一帧的不透明度。 */
export async function readAvatarDecorationFrames(path: string): Promise<{ frames: Uint8Array[]; width: number; height: number }> {
	// 先读入内存：sharp 按路径读取时会缓存文件句柄，Windows 上之后无法删除临时文件。
	const input = await fs.readFile(path);
	const meta = await sharp(input).metadata();
	const pages = Math.min(meta.pages ?? 1, MAX_FRAMES);
	const { data, info } = await sharp(input, { animated: pages > 1, pages })
		.resize({ width: ANALYSIS_WIDTH, withoutEnlargement: true })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const width = info.width;
	const height = info.pageHeight ?? info.height;
	const size = width * height;
	const count = Math.max(1, Math.floor(info.height / height));
	const alpha = new Uint8Array(size * count);
	for (let i = 0; i < alpha.length; i++) {
		alpha[i] = data[i * info.channels + info.channels - 1];
	}
	const frames = Array.from({ length: count }, (_, frame) => alpha.subarray(frame * size, (frame + 1) * size));
	return { frames, width, height };
}
