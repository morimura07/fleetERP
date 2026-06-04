import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '@fleeterp/shared';
import type { RoleKey } from '@fleeterp/shared';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, legalEntity: true },
    });
    if (!user || user.isLocked) {
      throw new UnauthorizedException('Account not found or locked');
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role.key as RoleKey,
      legalEntityId: user.legalEntityId,
      legalEntityCode: user.legalEntity.code,
    };
  }
}
