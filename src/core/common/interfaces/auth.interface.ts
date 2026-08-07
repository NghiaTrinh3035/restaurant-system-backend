import { Request } from 'express';
import { ICurrentUser } from './current-user.interface';

export interface IJwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface IAuthResult {
  accessToken: string;
  refreshToken: string;
  user: any;
}

export interface AuthRequest extends Request {
  user: ICurrentUser
}
