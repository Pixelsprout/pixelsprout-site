/** @type {import('shiki').ThemeRegistration} */
export const soil = {
  name: 'soil',
  type: 'dark',
  colors: { 'editor.background': '#120D0A', 'editor.foreground': '#EDE3CC' },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#A8977F' } },
    { scope: ['keyword', 'keyword.control', 'storage.modifier'], settings: { foreground: '#C79BE0' } },
    { scope: ['entity.name.function', 'support.function', 'variable.function'], settings: { foreground: '#9BD46B' } },
    { scope: ['entity.name.type', 'support.type', 'storage.type', 'entity.name.tag'], settings: { foreground: '#F0A070' } },
    { scope: ['string', 'constant.character'], settings: { foreground: '#E6C98A' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#F0A070' } },
  ],
};
