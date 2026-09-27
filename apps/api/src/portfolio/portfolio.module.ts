import { Module } from '@nestjs/common';
import { EducationModule } from '../education/education.module';
import { ExperiencesModule } from '../experiences/experiences.module';
import { ProfileModule } from '../profile/profile.module';
import { ProjectsModule } from '../projects/projects.module';
import { ServicesModule } from '../services/services.module';
import { SkillsModule } from '../skills/skills.module';
import { SocialLinksModule } from '../social-links/social-links.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [ProfileModule, SocialLinksModule, SkillsModule, ProjectsModule, ExperiencesModule, EducationModule, ServicesModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
