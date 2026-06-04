import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthUser, DashboardKpis } from '@fleeterp/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('kpis')
  kpis(@CurrentUser() user: AuthUser): Promise<DashboardKpis> {
    return this.dashboard.getKpis(user);
  }
}
