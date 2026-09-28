const element = (tagName, className, children) => ({
  type: 'element',
  tagName,
  properties: className ? { className: [className] } : {},
  children,
});

export const codeFrame = {
  name: 'pixelsprout:code-frame',
  root(root) {
    const title = /title="([^"]+)"/.exec(this.options.meta?.__raw ?? '')?.[1];
    const pre = root.children.find((node) => node.type === 'element' && node.tagName === 'pre');
    if (!pre) return;
    const bar = element('div', 'code-bar', title ? [element('span', null, [{ type: 'text', value: title }])] : []);
    root.children = [element('div', 'code', [bar, pre])];
  },
};
