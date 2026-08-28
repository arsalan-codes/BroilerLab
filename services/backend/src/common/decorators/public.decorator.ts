import { SetMetadata } from '@nestjs/common';

/** Mark a route as publicly accessible (no JWT required). */
export const Public = () => SetMetadata('isPublic', true);

/** Require a specific role (admin | researcher | viewer). */
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** Role-based access guard. Use with @Roles('admin'). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || !roles.length) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
