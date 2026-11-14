import { describe, expect, it } from 'vitest';
import { toggleTag, uniqueTags } from './tag-filter';

describe('toggleTag', () => {
  it('appends the tag after the ones already selected and goes back to the first page', () => {
    const next = toggleTag(new URLSearchParams('tags=React,Go&tagsMode=all&page=3'), 'Docker');
    expect(next.get('tags')).toBe('React,Go,Docker');
    expect(next.get('tagsMode')).toBe('all');
    expect(next.has('page')).toBe(false);
  });

  it('removes a selected tag, ignoring case like the API, keeping the others in order', () => {
    expect(toggleTag(new URLSearchParams('tags=react,Go,Docker&page=2'), 'React').toString()).toBe('tags=Go%2CDocker');
  });

  it('drops the parameter when the last tag is removed', () => {
    expect(toggleTag(new URLSearchParams('tags=Go&q=cli'), 'Go').toString()).toBe('q=cli');
  });
});

describe('uniqueTags', () => {
  it('keeps one spelling per tag, ignoring case, in alphabetical order', () => {
    expect(uniqueTags(['React', 'Node.js', 'react', 'PostgreSQL', 'go'])).toEqual(['go', 'Node.js', 'PostgreSQL', 'React']);
  });
});
