/**
 * Extract the most meaningful words from a block of text.
 * Returns an array of { word, weight } objects sorted by relevance (weight 0–1).
 */

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'shall','can','this','that','these','those','i','you','he','she','we',
  'they','it','my','your','his','her','our','their','its','not','no',
  'nor','so','yet','both','either','neither','as','if','then','than',
  'because','while','although','though','since','until','unless','when',
  'where','who','which','what','how','all','each','every','any','some',
  'such','more','most','other','into','through','about','up','down','out',
  'off','over','under','again','further','just','only','also','very','too',
  'much','many','well','now','here','there','never','always','often','like',
  'after','before','between','among','during','without','within','along',
  'following','across','behind','beyond','plus','except','however',
  'therefore','thus','hence','moreover','furthermore','nevertheless',
  'nonetheless','meanwhile','otherwise','instead','rather','quite',
  'perhaps','maybe','certainly','definitely','actually','really','simply',
  'truly','deeply','consider','ponder','let','us','one','two','three',
  'say','said','says','make','made','makes','come','comes','came','go',
  'goes','went','get','gets','got','see','sees','saw','take','takes','took',
  'know','knows','knew','think','thinks','thought','look','looks','looked',
  'use','uses','used','find','finds','found','give','gives','gave','tell',
  'tells','told','work','works','worked','call','calls','called',
]);

export function extractWords(text, maxWords = 40) {
  const tokens = text
    .toLowerCase()
    .replace(/[''""]/g, '')
    .split(/[\s\-–—,.:;!?()[\]{}<>/\\|@#$%^&*+=~`"]+/)
    .filter(t => t.length >= 3 && t.length <= 25)
    .filter(t => !STOP_WORDS.has(t))
    .filter(t => /^[a-z]+$/.test(t));

  const freq = {};
  tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });

  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords);

  if (sorted.length === 0) return [];

  const maxFreq = sorted[0][1];
  const minFreq = sorted[sorted.length - 1][1];
  const range = Math.max(1, maxFreq - minFreq);

  return sorted.map(([word, count]) => ({
    word,
    weight: (count - minFreq) / range,
  }));
}
