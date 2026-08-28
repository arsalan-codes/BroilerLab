import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../domain/entities/user.entity';
import { RegisterDto, LoginDto, TokenPair } from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private signAccess(u: User): string {
    const payload: JwtPayload = { sub: u.id, email: u.email, role: u.role };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET') || 'change-me-access',
      expiresIn: parseInt(this.config.get('JWT_ACCESS_TTL') || '900', 10),
    });
  }

  private signRefresh(u: User): string {
    const payload: JwtPayload = { sub: u.id, email: u.email, role: u.role };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET') || 'change-me-refresh',
      expiresIn: parseInt(this.config.get('JWT_REFRESH_TTL') || '1209600', 10),
    });
  }

  async register(dto: RegisterDto): Promise<TokenPair> {
    const exists = await this.users.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('email already registered');
    const hash = await bcrypt.hash(dto.password, 10);
    const user = this.users.create({
      email: dto.email,
      password_hash: hash,
      full_name: dto.full_name ?? null,
      role: dto.role ?? 'researcher',
    });
    const saved = await this.users.save(user);
    return { access_token: this.signAccess(saved), refresh_token: this.signRefresh(saved) };
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) throw new UnauthorizedException('invalid credentials');
    return { access_token: this.signAccess(user), refresh_token: this.signRefresh(user) };
  }

  /** Anti-IDOR helper: ensure a user owns a given cycle. */
  async assertOwner(ownerId: string, resourceOwnerId: string) {
    if (ownerId !== resourceOwnerId) throw new UnauthorizedException('not owner of resource');
  }
}
