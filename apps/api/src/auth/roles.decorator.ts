import { SetMetadata } from '@nestjs/common';
import type { RoleKey } from '@fleeterp/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);
