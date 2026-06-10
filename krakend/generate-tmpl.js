const fs = require('fs');

const config = JSON.parse(fs.readFileSync('krakend.json', 'utf8'));

delete config.extra_config['auth/validator'];

const propagated = ['x-user-id', 'x-user-role'];
const jwtValidatorPlaceholder = '__JWT_VALIDATOR__';

for (const ep of config.endpoints) {
  if (ep.public) continue;
  if (!ep.input_headers?.includes('Authorization')) continue;

  ep.input_headers = [...new Set([...ep.input_headers, ...propagated])];
  ep.extra_config = { 'auth/validator': jwtValidatorPlaceholder };
}

let tmpl = JSON.stringify(config, null, 2);

const jwtValidatorBlock = `{
          "alg": "HS256",
          "jwk_url": "http://social-auth-service:3001/api/auth/jwks",
          "disable_jwk_security": true,
          "cache": true,
          "roles_key": "role",
          "propagate_claims": [
            ["userId", "x-user-id"],
            ["role", "x-user-role"]
          ],
          "roles": ["admin", "moderator", "user", "guest"]
        }`;

tmpl = tmpl.replace(/"__JWT_VALIDATOR__"/g, jwtValidatorBlock);

fs.writeFileSync('krakend.tmpl', tmpl);
console.log('Generated krakend/krakend.tmpl');
