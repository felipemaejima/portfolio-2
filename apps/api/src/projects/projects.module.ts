import { Module } from '@nestjs/common';
import { ProjectsController, PublicProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [PublicProjectsController, ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
