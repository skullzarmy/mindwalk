/**
 * Development-only memory monitor.
 * Warns in the console when JS heap usage grows by more than `thresholdMB`
 * (default 50 MB) relative to the baseline taken at call time.
 *
 * Uses the non-standard `performance.memory` API that is available in
 * Chromium-based browsers.  It is a no-op in all other environments and in
 * production builds.
 *
 * @param {string} componentName  Label printed in warning messages.
 * @param {number} [thresholdMB=50]  MB growth before a warning is emitted.
 * @returns {() => void}  Cleanup function – call it to stop monitoring.
 */
export function monitorMemory(componentName, thresholdMB = 50) {
  if (process.env.NODE_ENV !== 'development') return () => {};

  if (typeof performance === 'undefined' || !performance.memory) {
    console.warn(
      `[memoryMonitor] performance.memory is not available (Chromium only). ` +
      `Skipping memory monitoring for ${componentName}.`
    );
    return () => {};
  }

  const initial = performance.memory.usedJSHeapSize;
  const thresholdBytes = thresholdMB * 1024 * 1024;
  let checkCount = 0;
  const MAX_CHECKS = 20;

  const interval = setInterval(() => {
    const current = performance.memory.usedJSHeapSize;
    const delta = current - initial;
    checkCount++;

    if (delta > thresholdBytes) {
      const deltaMB = (delta / 1024 / 1024).toFixed(2);
      console.warn(
        `⚠️ [memoryMonitor] ${componentName}: +${deltaMB} MB detected ` +
        `after ${checkCount} check(s). Possible memory leak.`
      );
    }

    if (checkCount >= MAX_CHECKS) {
      clearInterval(interval);
    }
  }, 5000);

  return () => clearInterval(interval);
}
