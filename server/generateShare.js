import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getStore } from '@netlify/blobs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Use process.cwd() instead of __dirname to securely load static assets inside
// Netlify Lambda functions, because esbuild flattens the directory tree during bundling.
const fontDir = path.join(process.cwd(), 'server', 'fonts');
const interRegular = fs.readFileSync(path.join(fontDir, 'inter-regular.ttf'));
const interBold = fs.readFileSync(path.join(fontDir, 'inter-bold.ttf'));
const shareTechMono = fs.readFileSync(path.join(fontDir, 'share-tech-mono.ttf'));

/**
 * Generates an SVG string using Satori and exact HTML styling constraints,
 * avoiding any OS font quirks. Then converts that SVG securely into a PNG buffer.
 * Finally uploads to Netlify Blobs if not cached.
 * 
 * @param {string} constellationName 
 * @param {Array<string>} wordPath 
 * @param {string} message 
 * @param {string} format 'portrait' | 'landscape'
 * @returns {string} The public blob URL or a local proxy URL 
 */
export async function generateAndStoreShareImage(constellationName, wordPath, message, format = 'portrait') {
  const isPortrait = format === 'portrait';
  const width = isPortrait ? 1080 : 1200;
  const height = isPortrait ? 1920 : 630;

  // ── Print Design Math (Dynamic & Massive) ──
  const paddingX = isPortrait ? 120 : 100;
  const paddingY = isPortrait ? 160 : 70;
  
  const eyebrowFontSize = isPortrait ? '28px' : '22px';
  const eyebrowTracking = isPortrait ? '12px' : '4px';
  
  // Dynamic Header Sizing
  // We want it HUGE but we must dynamically scale it so it doesn't wrap awkwardly
  const maxTitleSize = isPortrait ? 190 : 96;
  const minTitleSize = isPortrait ? 90 : 60;
  const charCount = Math.max(8, constellationName.length); 
  // Avg uppercase bold char is ~0.55x the font size
  const calculatedSize = Math.floor((width - paddingX * 2) / (charCount * 0.55));
  const titleFontSize = `${Math.max(minTitleSize, Math.min(maxTitleSize, calculatedSize))}px`;
  
  const pathFontSize = isPortrait ? '36px' : '24px';
  const msgFontSize = isPortrait ? '56px' : '36px';
  const msgLineHeight = isPortrait ? '1.4' : '1.3';

  // Strip raw < and > to guarantee the Satori parser never chokes 
  // on hallucinatory LLM tags, and convert HTML entities.
  const escapeForSatori = (str) => {
    if (!str) return str;
    return str
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '') // Stripping explicit less-than entities so it doesn't parse to <
      .replace(/&gt;/g, '') // Same for greater-than
      .replace(/</g, '')    // Strip any raw rogue angle brackets
      .replace(/>/g, '');   // Strip any raw rogue angle brackets
  };

  const safeConstellationName = escapeForSatori(constellationName);
  const safeMessage = escapeForSatori(message);

  // Instead of relying on missing font glyphs or ASCII arrows, construct flawless 
  // inline SVG arrows. Satori fully natively supports rendering SVG primitive shapes!
  const pathElementsHTML = wordPath.map((w, index) => {
    const isLast = index === wordPath.length - 1;
    const wordText = escapeForSatori(w).toUpperCase();
    if (isLast) {
      return `<div style="display: flex; align-items: center; margin-bottom: 10px;"><span style="white-space: nowrap;">${wordText}</span></div>`;
    } else {
      return `<div style="display: flex; align-items: center; margin-right: 15px; margin-bottom: 10px;"><span style="white-space: nowrap;">${wordText}</span><svg viewBox="0 0 24 24" width="1em" height="1em" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 15px; opacity: 0.8;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></div>`;
    }
  }).join('');

  // ── Procedural Constellation Background Engine ──
  // Deterministically generate a bespoke constellation web spanning the background
  const generateConstellationSVG = (words, w, h, isPort) => {
    let seed = words.join('').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = () => {
      let x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const points = [];
    const minX = isPort ? 150 : 100;
    const maxX = isPort ? w - 150 : w - 100;
    
    // In portrait, constrain the constellation prominently to the massive middle gap
    // In landscape, spread it across the background bounds
    const minY = isPort ? 450 : 100;
    const maxY = isPort ? h - 550 : h - 100;
    
    for (let i = 0; i < words.length; i++) {
        const progress = i / Math.max(1, (words.length - 1));
        
        let px, py;
        if (isPort) {
            const base_y = minY + progress * (maxY - minY);
            py = base_y + (random() - 0.5) * 200; 
            px = minX + random() * (maxX - minX);
        } else {
            const base_x = minX + progress * (maxX - minX);
            px = base_x + (random() - 0.5) * 150;
            py = minY + random() * (maxY - minY);
        }

        px = Math.max(minX, Math.min(maxX, px));
        py = Math.max(minY, Math.min(maxY, py));
        points.push({ x: px, y: py });
    }

    // Add glowing ambient radial backgrounds
    let defs = `
      <defs>
        <radialGradient id="glowNode" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#00ffff" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#00ffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glowEndNode" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#c084fc" stop-opacity="1"/>
          <stop offset="100%" stop-color="#c084fc" stop-opacity="0"/>
        </radialGradient>
      </defs>
    `;

    let lines = '';
    for (let i = 0; i < points.length - 1; i++) {
      lines += `<line x1="${points[i].x}" y1="${points[i].y}" x2="${points[i+1].x}" y2="${points[i+1].y}" stroke="url(#lineGradient)" stroke-width="${isPort ? 4 : 2}" opacity="0.4" />`;
    }

    let circles = '';
    points.forEach((p, i) => {
      const isEndpoint = i === 0 || i === points.length - 1;
      const radius = isEndpoint ? (isPort ? 14 : 10) : (isPort ? 8 : 6);
      const strokeWidth = isEndpoint ? 4 : 2;
      const stroke = isEndpoint ? '#c084fc' : '#00ffff';
      const fill = '#050510';
      
      // Ambient large glow behind node
      const glowR = isEndpoint ? radius * 8 : radius * 6;
      const gradId = isEndpoint ? 'glowEndNode' : 'glowNode';
      circles += `<circle cx="${p.x}" cy="${p.y}" r="${glowR}" fill="url(#${gradId})" opacity="0.3" />`;
      
      // Core point
      circles += `<circle cx="${p.x}" cy="${p.y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="1" />`;
    });

    const rawSvgOutput = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00ffff"/>
          <stop offset="100%" stop-color="#c084fc"/>
        </linearGradient>
      ${lines}${circles}</svg>`;
      
    // Return a base64 Data URI so Satori uses native image rendering and bypasses the AST parser 
    // which crashes when encountering complex SVG defs without explicit flex children.
    const b64 = Buffer.from(rawSvgOutput).toString('base64');
    return `<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; background-image: url('data:image/svg+xml;base64,${b64}');"></div>`;
  };

  // ── Satori HTML Template ──
  // Instead of using the \`html\` template literal tag (which actively escapes all injected variables
  // and breaks our beautiful SVG elements into raw text), we construct one massive raw template string
  // and pass it ONCE to the \`html(str)\` parser. Since we explicitly stripped < and > above, 
  // we do not need the try/catch fallback anymore.
  const rawHTMLString = `
    <div style="display: flex; flex-direction: column; width: ${width}px; height: ${height}px; background-color: #030308; color: white; justify-content: space-between; padding: ${paddingY}px ${paddingX}px; box-sizing: border-box; position: relative;">
      
      <!-- Procedural Constellation Graphic -->
      ${generateConstellationSVG(wordPath, width, height, isPortrait)}

      <!-- Gradient overlay for depth -->
      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; background-image: linear-gradient(to bottom, rgba(3, 3, 8, 0.1) 0%, rgba(3, 3, 8, 0.6) 50%, rgba(3, 3, 8, 0.98) 100%);"></div>

      <!-- TOP ANCHOR: Branding & Massive Title -->
      <div style="display: flex; flex-direction: column; align-items: flex-start;">
        <div style="display: flex; color: #00ffff; font-family: 'Share Tech Mono'; font-size: ${eyebrowFontSize}; font-weight: 600; letter-spacing: ${eyebrowTracking}; text-transform: uppercase; padding: 6px 16px; border: 2px solid rgba(0, 255, 255, 0.4); border-radius: 30px; background-color: rgba(0, 255, 255, 0.05); align-items: center;">
          MINDWALK CONSTELLATION
        </div>
        <div style="display: flex; flex-wrap: wrap; text-align: left; font-family: 'Inter'; font-weight: 700; font-size: ${titleFontSize}; margin-top: ${isPortrait ? '40px' : '20px'}; line-height: 1.05; text-transform: uppercase;">
          <span style="color: transparent; background-clip: text; background-image: linear-gradient(90deg, #ffffff 0%, #00ffff 60%, #c084fc 100%); text-shadow: 0px 4px 40px rgba(0, 255, 255, 0.3);">
            ${safeConstellationName}
          </span>
        </div>
      </div>

      <!-- BOTTOM ANCHOR: Path & Message -->
      <div style="display: flex; flex-direction: column; align-items: flex-start;">
        
        <!-- Glassmorphic Path Container -->
        <div style="display: flex; flex-wrap: wrap; text-align: left; color: #c084fc; font-family: 'Share Tech Mono'; font-weight: 600; font-size: ${pathFontSize}; line-height: 1.6; text-transform: uppercase; margin-bottom: ${isPortrait ? '50px' : '30px'}; padding: 16px 24px; background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px;">
          ${pathElementsHTML}
        </div>
        
        <!-- Elegant Message with left accent -->
        <div style="display: flex; flex-wrap: wrap; text-align: left; color: #f8fafc; font-family: 'Inter'; font-weight: 400; font-size: ${msgFontSize}; line-height: ${msgLineHeight}; border-left: 6px solid #c084fc; padding-left: 24px;">
          ${safeMessage}
        </div>
        
        <!-- Subtle Footer Name -->
        <div style="display: flex; width: 100%; justify-content: flex-end; color: rgba(255, 255, 255, 0.4); font-family: 'Share Tech Mono'; font-size: ${isPortrait ? '24px' : '18px'}; margin-top: ${isPortrait ? '80px' : '40px'}; letter-spacing: 2px;">
          MINDWALK.JOEPETERSON.WORK
        </div>
      </div>
    </div>
  `;

  // satori-html is ESM-only (no CJS export). When esbuild bundles this file for
  // Netlify Functions in CJS mode, static imports of ESM-only packages are
  // converted to require() calls which fail at runtime. Dynamic import() works
  // in CJS modules and correctly loads the ESM package via the ESM loader.
  const { html } = await import('satori-html');

  const template = html(rawHTMLString);
  const svg = await satori(template, {
    width,
    height,
    fonts: [
      { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
      { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
      { name: 'Share Tech Mono', data: shareTechMono, weight: 600, style: 'normal' }
    ],
  });

  const resvg = new Resvg(svg, {
    background: '#050510',
    fitTo: { mode: 'width', value: width },
  });
  
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  // Create deterministic hash for filename based on specific user payload
  const payloadStr = JSON.stringify({ constellationName, wordPath, message, format });
  const hash = crypto.createHash('sha256').update(payloadStr).digest('hex').substring(0, 16);
  const blobKey = `share-${hash}`;

  // Netlify Blobs Upload
  try {
    const siteId = process.env.NETLIFY_SITE_ID || 'local-dev-fallback';
    const blobsAuth = process.env.NETLIFY_BLOBS_TOKEN;
    
    // In local dev without netlify connected, we fallback to returning base64 directly
    // to keep UX functional for testing. In prod it uploads to blobs.
    if (!blobsAuth) {
      return `data:image/png;base64,${pngBuffer.toString('base64')}`;
    }

    const store = getStore({ name: 'mindwalk-shares', siteID: siteId, token: blobsAuth });
    
    // Upload if not exists
    const existing = await store.getMetadata(blobKey);
    if (!existing) {
      await store.set(blobKey, pngBuffer, {
        metadata: { format, generatedAt: new Date().toISOString() }
      });
    }

    // Usually blobs are accessed via a fast-path proxy rewrite in netlify.toml 
    // or an edge function serving the blob. 
    // We will serve it publicly through our own node back-end for now: /api/blob/:key
    return `/api/blob/${blobKey}`;

  } catch (error) {
    console.warn("Netlify Blobs upload failed, falling back to base64 encoding (likely local dev)", error.message);
    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
  }
}
