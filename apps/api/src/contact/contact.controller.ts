import { Body, Controller, Module, NotImplementedException, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Public } from '../common/public.decorator';

export class ContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}

/** Contract and protection are in place; the delivery channel is still undecided. */
@ApiTags('public')
@Public()
@Controller('contact')
export class ContactController {
  @Post()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  send(@Body() _dto: ContactDto): never {
    throw new NotImplementedException('Contact channel not implemented yet');
  }
}

@Module({ controllers: [ContactController] })
export class ContactModule {}
