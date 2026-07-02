import { ServiceTokenService } from '../../src/routes/internal/service-token.service';

describe('ServiceTokenService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test-service-token-secret',
      SERVICE_CLIENT_POST_SERVICE_ID: 'post-service',
      SERVICE_CLIENT_POST_SERVICE_SECRET: 'post-secret',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('issues a service token for valid client credentials', () => {
    const service = new ServiceTokenService();
    const token = service.issueToken({
      clientId: 'post-service',
      clientSecret: 'post-secret',
      audience: 'user-service',
    });

    expect(token.access_token).toEqual(expect.any(String));
    expect(token.token_type).toBe('Bearer');
    expect(token.expires_in).toBe(300);
  });

  it('rejects invalid client secret', () => {
    const service = new ServiceTokenService();
    expect(() =>
      service.issueToken({
        clientId: 'post-service',
        clientSecret: 'wrong-secret',
        audience: 'user-service',
      })
    ).toThrow('INVALID_CLIENT_CREDENTIALS');
  });
});
