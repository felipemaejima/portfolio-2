import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { MediaQuery } from './media.dto';
import { MediaService } from './media.service';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@ApiTags('admin/media')
@ApiBearerAuth()
@Controller('admin')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    return this.media.upload(file.buffer);
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
