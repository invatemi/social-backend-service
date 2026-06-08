import { PrismaClient } from '../../generated/prisma';

export interface UserRegistrationEvent {
  userId: number;
  username: string;
  email: string;
  roleId: number;
}

export class EmailConflictError extends Error {
  constructor(email: string, existingUserId: number, requestedUserId: number) {
    super(
      `Email ${email} is already used by user ${existingUserId}, cannot provision user ${requestedUserId}`
    );
    this.name = 'EmailConflictError';
  }
}

export class UserProvisioningService {
  constructor(private prisma: PrismaClient) {}

  /** Creates or updates a user profile from a registration event. */
  async provisionFromRegistration(event: UserRegistrationEvent): Promise<void> {
    const { userId, username, email, roleId } = event;

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingByEmail && existingByEmail.id !== userId) {
      throw new EmailConflictError(email, existingByEmail.id, userId);
    }

    await this.prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        name: username,
        email,
        roleId,
      },
      update: {
        name: username,
        email,
      },
    });
  }
}
