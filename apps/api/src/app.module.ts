import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { PrismaThrottlerStorage } from './common/prisma-throttler.storage';
import { ConfigModule } from './config/config';
import { ContactModule } from './contact/contact.controller';
import { CvModule } from './cv/cv.controller';
import { EducationModule } from './education/education.module';
import { ExperiencesModule } from './experiences/experiences.module';
import { HealthModule } from './health/health.controller';
import { MediaModule } from './media/media.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
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
    // Only sensitive routes are rate-limited here (ClientIpThrottlerGuard + @Throttle); the generic global limit
    // lives in API Gateway. Counters are in Postgres because Lambda instances share no memory.
    ThrottlerModule.forRootAsync({
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => ({
        throttlers: [{ ttl: 60_000, limit: 10 }],
        storage: new PrismaThrottlerStorage(prisma),
      }),
    }),
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
    HealthModule,
  ],
})
export class AppModule {}
