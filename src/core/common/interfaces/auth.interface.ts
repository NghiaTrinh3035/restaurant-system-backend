import { Request } from 'express';
import { ICurrentUser } from './current-user.interface';
import { Role } from '@prisma/client';

export interface IJwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface IAuthResult {
  accessToken: string;
  refreshToken: string;
  user: any;
}

export interface AuthRequest extends Request {
  user: ICurrentUser
}
