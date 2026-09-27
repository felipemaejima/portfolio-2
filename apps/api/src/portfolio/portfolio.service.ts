import { Injectable } from '@nestjs/common';
import type { Lang } from '../common/localized-text';
import { EducationService } from '../education/education.service';
import { ExperiencesService } from '../experiences/experiences.service';
import { ProfileService } from '../profile/profile.service';
import { ProjectsService } from '../projects/projects.service';
import { ServicesService } from '../services/services.service';
import { SkillCategoriesService } from '../skills/skills.service';
import { SocialLinksService } from '../social-links/social-links.service';

export type PublicPortfolio = Awaited<ReturnType<PortfolioService['get']>>;

/** Everything the public home page shows, visible items only, resolved to one language. */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly profile: ProfileService,
    private readonly socialLinks: SocialLinksService,
    private readonly skillCategories: SkillCategoriesService,
    private readonly projects: ProjectsService,
    private readonly experiences: ExperiencesService,
    private readonly education: EducationService,
    private readonly services: ServicesService,
  ) {}

  async get(lang: Lang) {
    const [profile, socialLinks, skillCategories, projects, experiences, education, services] = await Promise.all([
      this.profile.findPublic(lang),
      this.socialLinks.findPublic(),
      this.skillCategories.findPublic(lang),
      this.projects.findFeatured(lang),
      this.experiences.findPublic(lang),
      this.education.findPublic(lang),
      this.services.findPublic(lang),
    ]);
    return { profile, socialLinks, skillCategories, projects, experiences, education, services };
  }
}
