import { Body, Controller, HttpCode, Inject, Module, Post, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Discord rejects blank embed fields, and a blank message says nothing. */
const NOT_BLANK = [/\S/, { message: '$property must not be blank' }] as const;
import { ClientIpThrottlerGuard } from '../common/client-ip-throttler.guard';
import { postToDiscord } from '../common/discord';
import { Public } from '../common/public.decorator';
import { CONFIG, type Config } from '../config/config';

export class ContactDto {
  @IsString()
  @Matches(...NOT_BLANK)
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  /**
   * Up to 4000 UTF-16 units, as the form's maxLength counts them (MaxLength counts "❤️" as one): it always fits a
   * Discord embed description (4096) whole, so nothing is ever cut.
   */
  @IsString()
  @Matches(...NOT_BLANK)
  @Matches(/^[\s\S]{0,4000}$/, { message: '$property must be at most 4000 characters' })
  message: string;

  /** Hidden from people in the form, so only bots fill it. */
  @IsOptional()
  @IsString()
  honeypot?: string;
}

/** A Mensagem de contato goes to the owner's #contato channel on Discord. */
@ApiTags('public')
@Public()
@Controller('contact')
export class ContactController {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Post()
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Delivered (or silently dropped: honeypot filled)' })
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async send(@Body() dto: ContactDto): Promise<void> {
    if (dto.honeypot) return; // a bot: it gets a success, nothing is sent
    await postToDiscord(this.config.DISCORD_CONTACT_WEBHOOK_URL, {
      title: 'Mensagem de contato',
      description: dto.message,
      fields: [
        { name: 'Nome', value: dto.name, inline: true },
        { name: 'E-mail', value: dto.email, inline: true },
      ],
    });
  }
}

@Module({ controllers: [ContactController] })
export class ContactModule {}
