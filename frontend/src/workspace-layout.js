// Keep sticky notebook panels below the header, including wrapped/mobile headers.
export function observeWorkspaceHeader(header, environment = window) {
  const workspace = header?.closest('.workspace-app');
  if (!workspace) return () => {};
  const measure = () => {
    const height = header.getBoundingClientRect().height;
    if (Number.isFinite(height) && height > 0) workspace.style.setProperty('--workspace-header-height', `${Math.ceil(height)}px`);
  };
  measure();
  if (typeof environment.ResizeObserver === 'function') {
    const observer = new environment.ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }
  environment.addEventListener?.('resize', measure, {passive:true});
  return () => environment.removeEventListener?.('resize', measure);
}
