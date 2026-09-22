// Source boxes and buttons use production components; only host hooks are substituted.
export const useRevealedText = (text) => text;
export const copyText = (text) => navigator.clipboard.writeText(text);
