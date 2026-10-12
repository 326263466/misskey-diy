/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NodeTypes } from '@vue/compiler-core';
import type { ElementNode, NodeTransform, TransformContext } from '@vue/compiler-core';
import type { Options } from '@vitejs/plugin-vue';

const managedDepth = new WeakMap<TransformContext, number>();

function managesImages(node: ElementNode): boolean {
	return node.props.some(prop => prop.type === NodeTypes.ATTRIBUTE && (
		(prop.name === 'data-image-fade' && (prop.value?.content === 'managed' || prop.value?.content === 'off')) ||
		(prop.name === 'id' && prop.value?.content === 'splash')
	));
}

const deferImageSources: NodeTransform = (node, context) => {
	if (node.type !== NodeTypes.ELEMENT) return;
	const previousDepth = managedDepth.get(context) ?? 0;
	const managed = managesImages(node);
	const skipped = managed || previousDepth > 0;
	if (managed) managedDepth.set(context, previousDepth + 1);

	return () => {
		if (!skipped && node.tag === 'img') {
			let deferred = false;
			// Vue 先转换静态资源 URL，再执行自定义 transform；退出时改名保留资源 import。
			for (const prop of node.props) {
				if (prop.type === NodeTypes.ATTRIBUTE && (prop.name === 'src' || prop.name === 'srcset')) {
					prop.name = `data-image-${prop.name}`;
					deferred = true;
				} else if (prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.isStatic && (prop.arg.content === 'src' || prop.arg.content === 'srcset')) {
					prop.arg.content = `data-image-${prop.arg.content}`;
					prop.modifiers = prop.modifiers.filter(modifier => modifier.content !== 'prop' && modifier.content !== 'camel');
					deferred = true;
				}
			}
			if (deferred) {
				node.props.push({ type: NodeTypes.ATTRIBUTE, name: 'data-image-lazy', nameLoc: node.loc, value: undefined, loc: node.loc });
			}
		}
		if (managed) {
			if (previousDepth === 0) managedDepth.delete(context);
			else managedDepth.set(context, previousDepth);
		}
	};
};

/** 保留原生 img 和事件，由共享图片加载器在进入视口后恢复资源属性。 */
export const imageTemplateOptions: NonNullable<Options['template']> = {
	compilerOptions: { nodeTransforms: [deferImageSources] },
};
