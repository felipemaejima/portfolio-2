import { BadGatewayException, Logger } from '@nestjs/common';

/** The parts of a Discord embed we use: https://discord.com/developers/docs/resources/message#embed-object */
export type DiscordEmbed = {
  title: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
};

const logger = new Logger('Discord');

/**
 * Posts one embed to a Discord webhook and waits at most ~2 s for it (the Lambda is billed while it waits).
 * Mentions are never parsed: an `@everyone` typed by a visitor stays text. The webhook URL is a secret, so it is never
 * logged, not even on failure. Without a URL (local dev) the embed is only logged; production config requires the URLs.
 */
export async function postToDiscord(webhookUrl: string | undefined, embed: DiscordEmbed): Promise<void> {
  if (!webhookUrl) {
    logger.log(`No webhook configured, not sent: ${JSON.stringify(embed)}`);
    return;
  }
  let failure: string;
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) return;
    // Discord's error names the rejected field (diagnosable) and never echoes the URL.
    failure = `${response.status} ${(await response.text()).slice(0, 300)}`;
  } catch (error) {
    failure = (error as Error).name; // TimeoutError, TypeError: never the message, which may quote the URL
  }
  logger.error(`Webhook failed: ${failure}`);
  throw new BadGatewayException('Discord did not accept the message');
}
