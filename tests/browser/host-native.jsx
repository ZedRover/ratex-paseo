// Source boxes and buttons use production components; only host hooks are substituted.
export const copyText = (text) => navigator.clipboard.writeText(text);
export const useToast = () => ({
  show: (message) => window.toasts.push(message),
  error: (message) => window.toasts.push(message),
});
window.toasts = [];
