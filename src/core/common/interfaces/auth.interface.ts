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
