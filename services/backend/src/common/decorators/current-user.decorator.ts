import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Extract the authenticated user (set by JwtAuthGuard) from the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
