/**
 * Client-side share image generator using the HTML Canvas 2D API.
 * Uses an iterative layout engine (measure → fit → draw) to guarantee that
 * text never overlaps regardless of constellation name or message length.
 * Font sizes are scaled down automatically until both the top section
 * (badge + title) and bottom section (path + message + footer) fit with a
 * guaranteed minimum gap between them.
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

  // ── Canvas geometry ──────────────────────────────────────────────────────────
  const paddingX     = isPortrait ? 120 : 100;
  const paddingY     = isPortrait ? 160 :  70;
  const contentWidth = width - paddingX * 2;

  // ── Fixed UI constants (never scaled) ────────────────────────────────────────
  const EYEBROW_FS      = isPortrait ? 28 : 22; // eyebrow badge font size
  const EYEBROW_TRACK   = isPortrait ? 12 :  4; // letter-spacing in px
  const FOOTER_FS       = isPortrait ? 24 : 18;
  const BADGE_PAD_H     = 16;                   // horizontal inner padding for badge
  const PATH_PAD_H      = 24;                   // horizontal inner padding for path box
  const PATH_PAD_V      = 16;                   // vertical inner padding for path box
  const MSG_ACCENT_W    = 6;                    // width of left accent bar on message
  const MSG_ACCENT_PAD  = 24;                   // gap between accent bar and message text
  const BADGE_GAP       = isPortrait ? 40 : 20; // space between badge bottom and title top
  const PATH_MARGIN_B   = isPortrait ? 50 : 30; // space between path box and message
  const FOOTER_MARGIN_T = isPortrait ? 80 : 40; // space between message and footer
  const MIN_GAP         = isPortrait ? 80 : 30; // guaranteed gap between top and bottom

  // ── Ensure fonts are loaded before measuring ──────────────────────────────────
  await Promise.all([
    document.fonts.load(`700 96px "Inter"`),
    document.fonts.load(`400 56px "Inter"`),
    document.fonts.load(`400 36px "Share Tech Mono"`),
  ]).catch(() => { /* fall back to system fonts */ });

  // ── Canvas setup ─────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // ── Initial variable font sizes (character-count driven title) ───────────────
  const maxTitleFS = isPortrait ? 190 :  96;
  const minTitleFS = isPortrait ?  90 :  60;
  const charCount  = Math.max(8, constellationName.length);
  const calcFS     = Math.floor(contentWidth / (charCount * 0.55));

  let titleFS = Math.max(minTitleFS, Math.min(maxTitleFS, calcFS));
  let msgFS   = isPortrait ? 56 : 36;
  let pathFS  = isPortrait ? 36 : 24;

  const totalAvail = height - paddingY * 2;

  // ── Layout measurement (pure — no drawing) ───────────────────────────────────
  // Returns the pixel height of the top section and bottom section for the
  // given variable font sizes.  The ctx font is a side effect used only for
  // measuring; it is reset before drawing begins.
  const measureLayout = () => {
    const badgeH = Math.round(EYEBROW_FS * 1.6);

    // Top section: badge + gap + title lines
    ctx.font = `700 ${titleFS}px "Inter"`;
    const titleLines = _wrapText(ctx, constellationName.toUpperCase(), contentWidth);
    const titleLineH = Math.ceil(titleFS * 1.1); // slightly generous for descenders
    const titleH     = titleLines.length * titleLineH;
    const topH       = badgeH + BADGE_GAP + titleH;

    // Bottom section: path box + margin + message + margin + footer
    ctx.font = `400 ${pathFS}px "Share Tech Mono"`;
    const pathStr   = wordPath.map(w => w.toUpperCase()).join('  \u2192  ');
    const pathLines = _wrapText(ctx, pathStr, contentWidth - PATH_PAD_H * 2);
    const pathLineH = Math.round(pathFS * 1.6);
    const pathContH = pathLines.length * pathLineH + PATH_PAD_V * 2;

    ctx.font = `400 ${msgFS}px "Inter"`;
    const msgLines = _wrapText(ctx, message, contentWidth - MSG_ACCENT_W - MSG_ACCENT_PAD);
    const msgLineH = Math.round(msgFS * (isPortrait ? 1.4 : 1.3));
    const msgH     = msgLines.length * msgLineH;

    const bottomH = pathContH + PATH_MARGIN_B + msgH + FOOTER_MARGIN_T + FOOTER_FS;

    return { badgeH, titleLines, titleLineH, titleH, topH,
             pathStr, pathLines, pathLineH, pathContH,
             msgLines, msgLineH, msgH, bottomH };
  };

  // ── Iterative scaling: shrink variable fonts until content fits ───────────────
  // Each pass reduces the fonts proportionally.  sqrt() softens the reduction
  // so we don't overshoot on the first pass; 6 passes always converge.
  for (let pass = 0; pass < 6; pass++) {
    const { topH, bottomH } = measureLayout();
    const needed = topH + MIN_GAP + bottomH;
    if (needed <= totalAvail) break;

    const scale = Math.sqrt(totalAvail / needed) * 0.96; // 4% reduction for safety
    titleFS = Math.max(isPortrait ? 40 : 24, Math.floor(titleFS * scale));
    msgFS   = Math.max(isPortrait ? 22 : 14, Math.floor(msgFS   * scale));
    pathFS  = Math.max(14,                   Math.floor(pathFS  * scale));
  }

  // ── Final measurement with converged font sizes ───────────────────────────────
  const L = measureLayout();

  // ── Draw: background ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, width, height);

  // ── Draw: procedural constellation ────────────────────────────────────────────
  _drawConstellation(ctx, wordPath, width, height, isPortrait);

  // ── Draw: depth gradient overlay ─────────────────────────────────────────────
  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0,   'rgba(3,3,8,0.10)');
  overlay.addColorStop(0.5, 'rgba(3,3,8,0.60)');
  overlay.addColorStop(1,   'rgba(3,3,8,0.98)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  // ── Draw: TOP ANCHOR ──────────────────────────────────────────────────────────
  let topY = paddingY;

  // Eyebrow badge — measure text at the fixed font so badge width is exact
  ctx.font = `400 ${EYEBROW_FS}px "Share Tech Mono"`;
  _setLetterSpacing(ctx, `${EYEBROW_TRACK}px`);
  const EYEBROW_LABEL = 'MINDWALK CONSTELLATION';
  const eyebrowW      = ctx.measureText(EYEBROW_LABEL).width;
  _setLetterSpacing(ctx, '0px');
  // Browsers without letterSpacing support under-report width; add manual spacing.
  // Letter-spacing applies after each character except the last, hence length - 1.
  const extraW  = _supportsLetterSpacing ? 0 : EYEBROW_TRACK * (EYEBROW_LABEL.length - 1);
  const badgeW  = Math.min(contentWidth, eyebrowW + extraW + BADGE_PAD_H * 2);

  _drawRoundRect(ctx, paddingX, topY, badgeW, L.badgeH, L.badgeH / 2);
  ctx.fillStyle   = 'rgba(0,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,255,255,0.40)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  ctx.fillStyle    = '#00ffff';
  ctx.font         = `400 ${EYEBROW_FS}px "Share Tech Mono"`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'left';
  _setLetterSpacing(ctx, `${EYEBROW_TRACK}px`);
  ctx.fillText(EYEBROW_LABEL, paddingX + BADGE_PAD_H, topY + L.badgeH / 2);
  _setLetterSpacing(ctx, '0px');

  topY += L.badgeH + BADGE_GAP;

  // Title — gradient text, lines already word-wrapped to contentWidth
  const titleGrad = ctx.createLinearGradient(paddingX, 0, paddingX + contentWidth, 0);
  titleGrad.addColorStop(0,   '#ffffff');
  titleGrad.addColorStop(0.6, '#00ffff');
  titleGrad.addColorStop(1,   '#c084fc');
  ctx.fillStyle    = titleGrad;
  ctx.font         = `700 ${titleFS}px "Inter"`;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  L.titleLines.forEach((line, i) => {
    ctx.fillText(line, paddingX, topY + i * L.titleLineH);
  });

  // ── Draw: BOTTOM ANCHOR ───────────────────────────────────────────────────────
  // Pinned to the bottom padding; gap between top and bottom is always ≥ MIN_GAP.
  const bottomStartY = height - paddingY - L.bottomH;

  // Glassmorphic path container
  _drawRoundRect(ctx, paddingX, bottomStartY, contentWidth, L.pathContH, 16);
  ctx.fillStyle   = 'rgba(255,255,255,0.03)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.fillStyle    = '#c084fc';
  ctx.font         = `400 ${pathFS}px "Share Tech Mono"`;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  L.pathLines.forEach((line, i) => {
    ctx.fillText(
      line,
      paddingX + PATH_PAD_H,
      bottomStartY + PATH_PAD_V + i * L.pathLineH
    );
  });

  // Message with left accent bar
  const msgY = bottomStartY + L.pathContH + PATH_MARGIN_B;
  ctx.fillStyle = '#c084fc';
  ctx.fillRect(paddingX, msgY, MSG_ACCENT_W, L.msgH);

  ctx.fillStyle    = '#f8fafc';
  ctx.font         = `400 ${msgFS}px "Inter"`;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  L.msgLines.forEach((line, i) => {
    ctx.fillText(line, paddingX + MSG_ACCENT_W + MSG_ACCENT_PAD, msgY + i * L.msgLineH);
  });

  // Branding footer — right-aligned
  const footerY = msgY + L.msgH + FOOTER_MARGIN_T;
  ctx.fillStyle    = 'rgba(255,255,255,0.40)';
  ctx.font         = `400 ${FOOTER_FS}px "Share Tech Mono"`;
  _setLetterSpacing(ctx, '2px');
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'right';
  ctx.fillText('MINDWALK.JOEPETERSON.WORK', paddingX + contentWidth, footerY);
  ctx.textAlign    = 'left';
  _setLetterSpacing(ctx, '0px');

  return canvas.toDataURL('image/png');
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Sets ctx.letterSpacing when supported.
 * Feature-detected once at module load so there's no per-call try/catch.
 */
const _supportsLetterSpacing = 'letterSpacing' in CanvasRenderingContext2D.prototype;
function _setLetterSpacing(ctx, value) {
  if (_supportsLetterSpacing) ctx.letterSpacing = value;
}

/**
 * Word-wraps `text` to fit within `maxWidth` pixels at the current ctx font.
 * Returns an empty array when text is empty or maxWidth is zero.
 */
function _wrapText(ctx, text, maxWidth) {
  if (!text || maxWidth <= 0) return [];
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
 * Uses the same deterministic seed algorithm so the same word path always
 * produces the same constellation pattern across renders.
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

  // Connecting lines — linear gradient cyan → purple, 40% opacity
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
    const radius = isEndpoint ? (isPortrait ? 14 : 10) : (isPortrait ? 8 : 6);
    const glowR  = isEndpoint ? radius * 8 : radius * 6;
    const glowRGB = isEndpoint ? '192,132,252' : '0,255,255';

    const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
    glowGrad.addColorStop(0, `rgba(${glowRGB},0.3)`);
    glowGrad.addColorStop(1, `rgba(${glowRGB},0)`);
    ctx.beginPath();
    ctx.fillStyle = glowGrad;
    ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle   = '#050510';
    ctx.fill();
    ctx.strokeStyle = isEndpoint ? '#c084fc' : '#00ffff';
    ctx.lineWidth   = isEndpoint ? 4 : 2;
    ctx.stroke();
  });
}
