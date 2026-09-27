import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config';
import { ContactModule } from './contact/contact.controller';
import { CvModule } from './cv/cv.controller';
import { EducationModule } from './education/education.module';
import { ExperiencesModule } from './experiences/experiences.module';
import { MediaModule } from './media/media.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PrismaModule } from './prisma/prisma.service';
import { ProfileModule } from './profile/profile.module';
import { ProjectsModule } from './projects/projects.module';
import { ServicesModule } from './services/services.module';
import { SkillsModule } from './skills/skills.module';
import { SocialLinksModule } from './social-links/social-links.module';
import { StorageModule } from './storage/storage.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    StorageModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    MediaModule,
    ProfileModule,
    SocialLinksModule,
    SkillsModule,
    ProjectsModule,
    ExperiencesModule,
    EducationModule,
    ServicesModule,
    PortfolioModule,
    CvModule,
    ContactModule,
  ],
  // Order matters: rate limiting runs before authentication.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
