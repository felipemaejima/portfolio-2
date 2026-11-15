import { expect, it } from 'vitest';
import { imageError, missingEnglish, resizeTo, type Field } from './fields';

const MB = 1024 * 1024;

it('refuses image types the API does not store, in Portuguese', () => {
  expect(imageError({ type: 'image/gif', size: 1000 })).toBe('Formato não aceito: use JPEG, PNG ou WebP.');
  expect(imageError({ type: 'image/svg+xml', size: 1000 })).toBeDefined();
  expect(imageError({ type: 'image/webp', size: 1000 })).toBeUndefined();
});

it('refuses images over the API limit of 4 MiB', () => {
  expect(imageError({ type: 'image/png', size: 4 * MB + 1 })).toBe('Imagem grande demais: o limite é 4 MB, mesmo depois de reduzida.');
  expect(imageError({ type: 'image/png', size: 4 * MB })).toBeUndefined();
});

it('shrinks the longest side to 1600px, keeping the aspect ratio', () => {
  expect(resizeTo({ width: 4000, height: 3000 }, MB)).toEqual({ width: 1600, height: 1200 });
  expect(resizeTo({ width: 1000, height: 3200 }, MB)).toEqual({ width: 500, height: 1600 });
});

it('sends images within 1600px and the limit as they are, never upscaled', () => {
  expect(resizeTo({ width: 1600, height: 900 }, MB)).toBeNull();
  expect(resizeTo({ width: 300, height: 200 }, MB)).toBeNull();
});

it('re-encodes at the same size an image within 1600px but over the limit', () => {
  expect(resizeTo({ width: 1500, height: 1500 }, 6 * MB)).toEqual({ width: 1500, height: 1500 });
});

it('flags a record whose filled localized texts lack English', () => {
  const fields: Field[] = [
    { key: 'title', label: 'Título', type: 'localized' },
    { key: 'bullets', label: 'Atividades', type: 'localizedList' },
    { key: 'company', label: 'Empresa', type: 'text' },
  ];
  const translated = { title: { pt: 'Olá', en: 'Hi' }, bullets: [{ pt: 'Fiz', en: 'Did' }], company: 'ACME' };
  expect(missingEnglish(fields, translated)).toBe(false);
  expect(missingEnglish(fields, { ...translated, title: { pt: 'Olá' } })).toBe(true);
  expect(missingEnglish(fields, { ...translated, bullets: [{ pt: 'Fiz', en: 'Did' }, { pt: 'Testei', en: ' ' }] })).toBe(true);
  expect(missingEnglish(fields, { ...translated, title: { pt: '' }, bullets: [] })).toBe(false); // nothing to translate
});
