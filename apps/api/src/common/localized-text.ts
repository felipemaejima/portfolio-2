import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const LANGS = ['pt', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Shape stored in every translatable JSONB column. */
export type LocalizedText = { pt: string; en?: string };

export class LocalizedTextDto {
  // Lets Prisma accept the DTO as a JSON value; the whitelist ValidationPipe still rejects unknown keys.
  [lang: string]: string | undefined;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  pt: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  en?: string;
}

/** Resolves a stored JSONB text for `lang`, falling back to Portuguese. */
export function tr(value: unknown, lang: Lang): string {
  const text = value as LocalizedText;
  return (lang === 'en' && text.en) || text.pt;
}

export function trAll(values: unknown, lang: Lang): string[] {
  return (values as LocalizedText[]).map((v) => tr(v, lang));
}
