import { describe, expect, it } from 'vitest';
import { paragraphs, splitItems } from './text';

describe('paragraphs', () => {
  it('splits text pasted with blank lines into paragraphs, keeping hard-wrapped lines together', () => {
    expect(paragraphs('Primeira linha\ncontinua.\n\nSegundo parágrafo.\n \nTerceiro.\n')).toEqual([
      'Primeira linha\ncontinua.',
      'Segundo parágrafo.',
      'Terceiro.',
    ]);
  });
});

describe('splitItems', () => {
  it('splits a list typed as "a | b" into its items', () => {
    expect(splitItems('Inglês Intermediário (Técnico) | Japonês Básico')).toEqual(['Inglês Intermediário (Técnico)', 'Japonês Básico']);
    expect(splitItems(' Remoto |Híbrido| ')).toEqual(['Remoto', 'Híbrido']);
    expect(splitItems('Mogi das Cruzes - SP')).toEqual(['Mogi das Cruzes - SP']);
  });
});
