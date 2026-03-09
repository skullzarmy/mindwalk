import { html } from 'satori-html';

const message = "A < B and B > C";
try {
  const t = html`<div>${message}</div>`;
  console.log(JSON.stringify(t, null, 2));
} catch(e) {
  console.log(e);
}
