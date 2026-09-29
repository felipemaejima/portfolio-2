import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from '../auth/auth.guard';
import { MediaQuery } from './media.dto';
import { MEDIA_MIMES, MediaService } from './media.service';

// Lambda caps synchronous payloads at 6 MB and binaries travel base64-encoded (+33%).
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

@ApiTags('admin/media')
@ApiSecurity(ADMIN_AUTH)
@Controller('admin')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * The request body is the file itself (e.g. `Content-Type: image/png`), not multipart: behind CloudFront OAC the
   * client must send the body's SHA-256, easy for raw bytes. The stored type still comes from the magic bytes.
   */
  @Post('uploads')
  @ApiConsumes(...MEDIA_MIMES)
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  upload(@Body() body: unknown) {
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException('Send the image bytes as the request body');
    return this.media.upload(body);
  }

  @Get('media')
  list(@Query() query: MediaQuery) {
    return this.media.list(query);
  }

  @Delete('media/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.media.remove(id);
  }
}
