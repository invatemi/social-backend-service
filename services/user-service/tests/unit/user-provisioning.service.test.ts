import {
  EmailConflictError,
  UserProvisioningService,
} from '../../src/routes/profile/user-provisioning.service';

describe('UserProvisioningService unit', () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws EmailConflictError when email belongs to another user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 99 });
    const service = new UserProvisioningService(prismaMock as any);

    await expect(
      service.provisionFromRegistration({
        userId: 1,
        username: 'john',
        email: 'john@example.com',
        roleId: 2,
      })
    ).rejects.toBeInstanceOf(EmailConflictError);
  });

  it('upserts user when email is free', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.upsert.mockResolvedValue({});
    const service = new UserProvisioningService(prismaMock as any);

    await service.provisionFromRegistration({
      userId: 1,
      username: 'john',
      email: 'john@example.com',
      roleId: 2,
    });

    expect(prismaMock.user.upsert).toHaveBeenCalled();
  });
});
