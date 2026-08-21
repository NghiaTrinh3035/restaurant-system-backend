import { Role } from "@prisma/client";

export interface ICurrentUser {
    id: string;
    email: string;
    role: Role;
}