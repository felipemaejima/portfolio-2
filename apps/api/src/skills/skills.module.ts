import { Module } from '@nestjs/common';
import { SkillCategoriesController, SkillsController } from './skills.controller';
import { SkillCategoriesService, SkillsService } from './skills.service';

@Module({
  controllers: [SkillCategoriesController, SkillsController],
  providers: [SkillCategoriesService, SkillsService],
  exports: [SkillCategoriesService],
})
export class SkillsModule {}
