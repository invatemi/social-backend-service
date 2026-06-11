const fs = require('fs');
const path = require('path');

const krakendDir = path.dirname(__filename);
const config = JSON.parse(fs.readFileSync(path.join(krakendDir, 'krakend.json'), 'utf8'));

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

const corsBlock = `{
      "allow_origins": [
        {{- $origins := splitList "," (env "CORS_ORIGINS" | default "http://localhost:5173") -}}
        {{- range $index, $origin := $origins -}}
        {{- if $index }},{{ end -}}
        {{ trim $origin " " | quote }}
        {{- end -}}
      ],
      "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      "allow_headers": ["Origin", "Authorization", "Content-Type", "Accept"],
      "expose_headers": ["Content-Length"],
      "max_age": "12h",
      "allow_credentials": false
    }`;

tmpl = tmpl.replace(/"__JWT_VALIDATOR__"/g, jwtValidatorBlock);
tmpl = tmpl.replace(/"__CORS_ORIGINS__"/g, corsBlock);

fs.writeFileSync(path.join(krakendDir, 'krakend.tmpl'), tmpl);
console.log('Generated krakend/krakend.tmpl');
