import fs from 'fs';

const app = fs.readFileSync('apps/worker/src/static/css/app.css');
const m = fs.readFileSync('apps/worker/src/static/css/m.css');

const out = `export const APP_CSS_B64 = ${JSON.stringify(app.toString('base64'))};
export const M_CSS_B64 = ${JSON.stringify(m.toString('base64'))};
export function decodeCss(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
export const APP_CSS = decodeCss(APP_CSS_B64);
export const M_CSS = decodeCss(M_CSS_B64);
`;

fs.writeFileSync('apps/worker/src/static/css-bundle.ts', out);
console.log('written', out.length);
