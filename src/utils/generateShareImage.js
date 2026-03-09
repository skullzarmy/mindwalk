/**
 * Client-side share image generator using the HTML Canvas 2D API.
 * Replicates the exact pixel-perfect design previously rendered server-side
 * with Satori + Resvg — same layout, same colour palette, same typography.
 *
 * @param {string}   constellationName
 * @param {string[]} wordPath
 * @param {string}   message
 * @param {'portrait'|'landscape'} format
 * @returns {Promise<string>} PNG data URL
 */
export async function generateShareImage(
  constellationName,
  wordPath,
  message,
  format = 'portrait'
) {
  const isPortrait = format === 'portrait';
  const width  = isPortrait ? 1080 : 1200;
  const height = isPortrait ? 1920 :  630;

  // ── Print Design Metrics (mirrors server/generateShare.js exactly) ──────────
  const paddingX = isPortrait ? 120 : 100;
  const paddingY = isPortrait ? 160 :  70;
  const contentWidth = width - paddingX * 2;

  const eyebrowSize     = isPortrait ? 28 : 22;
  const eyebrowTracking = isPortrait ? 12 :  4;   // letter-spacing in px

  const maxTitleSize  = isPortrait ? 190 : 96;
  const minTitleSize  = isPortrait ?  90 : 60;
  const charCount     = Math.max(8, constellationName.length);
  const calcSize      = Math.floor((width - paddingX * 2) / (charCount * 0.55));
  const titleFontSize = Math.max(minTitleSize, Math.min(maxTitleSize, calcSize));

  const pathFontSize = isPortrait ? 36 : 24;
  const msgFontSize  = isPortrait ? 56 : 36;
  const msgLineHeight = isPortrait ? 1.4 : 1.3;
  const footerFontSize = isPortrait ? 24 : 18;

  // ── Ensure web-fonts are ready before measuring ──────────────────────────────
  // Inter is registered via @fontsource imports in main.jsx.
  // Share Tech Mono is loaded from Google Fonts (index.html).
  await Promise.all([
    document.fonts.load(`700 ${titleFontSize}px "Inter"`),
    document.fonts.load(`400 ${msgFontSize}px "Inter"`),
    document.fonts.load(`400 ${pathFontSize}px "Share Tech Mono"`),
  ]).catch(() => { /* graceful fallback to system fonts */ });

  // ── Canvas setup ─────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // ── 1. Background ─────────────────────────────────────────────────────────
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, width, height);

  // ── 2. Procedural Constellation ─────────────────────────────────────────
  _drawConstellation(ctx, wordPath, width, height, isPortrait);

  // ── 3. Gradient overlay (depth / readability) ─────────────────────────────
  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0,   'rgba(3,3,8,0.10)');
  overlay.addColorStop(0.5, 'rgba(3,3,8,0.60)');
  overlay.addColorStop(1,   'rgba(3,3,8,0.98)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  // ── 4. Measure all text blocks for layout (measure → draw) ─────────────────

  // Eyebrow badge
  ctx.font = `400 ${eyebrowSize}px "Share Tech Mono"`;
  _setLetterSpacing(ctx, `${eyebrowTracking}px`);
  const eyebrowText    = 'MINDWALK CONSTELLATION';
  const eyebrowMetrics = ctx.measureText(eyebrowText);
  _setLetterSpacing(ctx, '0px');
  // Include manual letter-spacing total (extra spacing after each character)
  const eyebrowExtraSpacing = eyebrowTracking * eyebrowText.length;
  const badgePadH = 16;
  const badgeH    = Math.round(eyebrowSize * 1.6);
  const badgeW    = eyebrowMetrics.width + eyebrowExtraSpacing + badgePadH * 2;

  // Title
  ctx.font = `700 ${titleFontSize}px "Inter"`;
  const titleText  = constellationName.toUpperCase();
  const titleLines = _wrapText(ctx, titleText, contentWidth);
  const titleLineH = titleFontSize * 1.05;

  // Path container
  ctx.font = `400 ${pathFontSize}px "Share Tech Mono"`;
  const pathPadH = 24, pathPadV = 16;
  const pathStr   = wordPath.map(w => w.toUpperCase()).join('  \u2192  ');
  const pathLines = _wrapText(ctx, pathStr, contentWidth - pathPadH * 2);
  const pathLineH = Math.round(pathFontSize * 1.6);
  const pathContainerH = pathLines.length * pathLineH + pathPadV * 2;

  // Message
  ctx.font = `400 ${msgFontSize}px "Inter"`;
  const msgAccentW  = 6;
  const msgAccentPad = 24;
  const msgLines    = _wrapText(ctx, message, contentWidth - msgAccentW - msgAccentPad);
  const msgLineH    = Math.round(msgFontSize * msgLineHeight);
  const totalMsgH   = msgLines.length * msgLineH;

  // Bottom anchor total height
  const pathMarginBottom = isPortrait ? 50 : 30;
  const footerMarginTop  = isPortrait ? 80 : 40;
  const totalBottomH = (
    pathContainerH + pathMarginBottom +
    totalMsgH + footerMarginTop +
    footerFontSize
  );

  // ── 5. TOP ANCHOR ─────────────────────────────────────────────────────────
  let topY = paddingY;

  // Eyebrow badge
  _drawRoundRect(ctx, paddingX, topY, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle   = 'rgba(0,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,255,255,0.40)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  ctx.fillStyle    = '#00ffff';
  ctx.font         = `400 ${eyebrowSize}px "Share Tech Mono"`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'left';
  _setLetterSpacing(ctx, `${eyebrowTracking}px`);
  ctx.fillText(eyebrowText, paddingX + badgePadH, topY + badgeH / 2);
  _setLetterSpacing(ctx, '0px');

  topY += badgeH + (isPortrait ? 40 : 20);

  // Title — huge gradient text spanning content width
  ctx.font         = `700 ${titleFontSize}px "Inter"`;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  const titleGrad  = ctx.createLinearGradient(paddingX, 0, paddingX + contentWidth, 0);
  titleGrad.addColorStop(0,   '#ffffff');
  titleGrad.addColorStop(0.6, '#00ffff');
  titleGrad.addColorStop(1,   '#c084fc');
  ctx.fillStyle = titleGrad;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, paddingX, topY + i * titleLineH);
  });

  // ── 6. BOTTOM ANCHOR ──────────────────────────────────────────────────────
  const bottomStartY = height - paddingY - totalBottomH;

  // Glassmorphic path container
  _drawRoundRect(ctx, paddingX, bottomStartY, contentWidth, pathContainerH, 16);
  ctx.fillStyle   = 'rgba(255,255,255,0.03)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.fillStyle    = '#c084fc';
  ctx.font         = `400 ${pathFontSize}px "Share Tech Mono"`;
  ctx.textBaseline = 'top';
  pathLines.forEach((line, i) => {
    ctx.fillText(line, paddingX + pathPadH, bottomStartY + pathPadV + i * pathLineH);
  });

  // Message with left accent border
  const msgY = bottomStartY + pathContainerH + pathMarginBottom;
  ctx.fillStyle = '#c084fc';
  ctx.fillRect(paddingX, msgY, msgAccentW, totalMsgH);

  ctx.fillStyle    = '#f8fafc';
  ctx.font         = `400 ${msgFontSize}px "Inter"`;
  ctx.textBaseline = 'top';
  msgLines.forEach((line, i) => {
    ctx.fillText(line, paddingX + msgAccentW + msgAccentPad, msgY + i * msgLineH);
  });

  // Branding footer — right-aligned
  const footerY = msgY + totalMsgH + footerMarginTop;
  ctx.fillStyle    = 'rgba(255,255,255,0.40)';
  ctx.font         = `400 ${footerFontSize}px "Share Tech Mono"`;
  _setLetterSpacing(ctx, '2px');
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'right';
  ctx.fillText('MINDWALK.JOEPETERSON.WORK', paddingX + contentWidth, footerY);
  ctx.textAlign    = 'left';
  _setLetterSpacing(ctx, '0px');

  return canvas.toDataURL('image/png');
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Sets ctx.letterSpacing when the property is supported by the browser.
 * Falls back silently — text still renders, just without tracking.
 */
const _supportsLetterSpacing = 'letterSpacing' in CanvasRenderingContext2D.prototype;
function _setLetterSpacing(ctx, value) {
  if (_supportsLetterSpacing) ctx.letterSpacing = value;
}

/**
 * Word-wraps `text` to fit within `maxWidth` pixels given the current ctx font.
 * Returns at least one line.
 */
function _wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Draws a rounded rectangle path on `ctx`.
 * Compatible with browsers that pre-date the native ctx.roundRect() method.
 */
function _drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draws the procedural constellation background.
 * Uses the same deterministic seed algorithm as server/generateShare.js so the
 * same word path always produces the same constellation pattern.
 */
function _drawConstellation(ctx, words, w, h, isPortrait) {
  let seed = words.join('').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  const minX = isPortrait ? 150 : 100;
  const maxX = isPortrait ? w - 150 : w - 100;
  const minY = isPortrait ? 450 : 100;
  const maxY = isPortrait ? h - 550 : h - 100;

  const points = [];
  for (let i = 0; i < words.length; i++) {
    const progress = i / Math.max(1, words.length - 1);
    let px, py;
    if (isPortrait) {
      const baseY = minY + progress * (maxY - minY);
      py = baseY + (random() - 0.5) * 200;
      px = minX + random() * (maxX - minX);
    } else {
      const baseX = minX + progress * (maxX - minX);
      px = baseX + (random() - 0.5) * 150;
      py = minY + random() * (maxY - minY);
    }
    px = Math.max(minX, Math.min(maxX, px));
    py = Math.max(minY, Math.min(maxY, py));
    points.push({ x: px, y: py });
  }

  // Connecting lines — linear gradient cyan → purple, 40 % opacity
  ctx.save();
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < points.length - 1; i++) {
    const grad = ctx.createLinearGradient(
      points[i].x, points[i].y,
      points[i + 1].x, points[i + 1].y
    );
    grad.addColorStop(0, '#00ffff');
    grad.addColorStop(1, '#c084fc');
    ctx.beginPath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = isPortrait ? 4 : 2;
    ctx.moveTo(points[i].x, points[i].y);
    ctx.lineTo(points[i + 1].x, points[i + 1].y);
    ctx.stroke();
  }
  ctx.restore();

  // Node glows + core circles
  points.forEach((p, i) => {
    const isEndpoint = i === 0 || i === points.length - 1;
    const radius  = isEndpoint ? (isPortrait ? 14 : 10) : (isPortrait ? 8 : 6);
    const glowR   = isEndpoint ? radius * 8 : radius * 6;
    const glowRGB = isEndpoint ? '192,132,252' : '0,255,255';

    // Ambient radial glow
    const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
    glowGrad.addColorStop(0, `rgba(${glowRGB},0.3)`);
    glowGrad.addColorStop(1, `rgba(${glowRGB},0)`);
    ctx.beginPath();
    ctx.fillStyle = glowGrad;
    ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Core circle
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle   = '#050510';
    ctx.fill();
    ctx.strokeStyle = isEndpoint ? '#c084fc' : '#00ffff';
    ctx.lineWidth   = isEndpoint ? 4 : 2;
    ctx.stroke();
  });
}
