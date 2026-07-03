const fs = require('fs');
const path = require('path');

const krakendDir = path.dirname(__filename);
const config = JSON.parse(fs.readFileSync(path.join(krakendDir, 'krakend.json'), 'utf8'));

delete config.extra_config['auth/validator'];

const propagated = ['x-user-id', 'x-user-role'];
const validators = new Map();
let validatorIndex = 0;

const buildJwtValidatorBlock = (endpoint) => {
  const rolesLines =
    Array.isArray(endpoint.jwt_roles) && endpoint.jwt_roles.length > 0
      ? `,
          "roles_key": "role",
          "roles": ${JSON.stringify(endpoint.jwt_roles)}`
      : '';

  return `{
          "alg": "HS256",
          "jwk_url": "http://social-auth-service:3001/api/auth/jwks",
          "disable_jwk_security": {{ if eq (env "NODE_ENV" | default "production") "production" }}false{{ else }}true{{ end }},
          "issuer": "{{ env "JWT_ISSUER" | default "social-auth-service" }}",
          "audience": ["{{ env "JWT_AUDIENCE" | default "social-api" }}"],
          "cache": true${rolesLines},
          "propagate_claims": [
            ["userId", "x-user-id"],
            ["role", "x-user-role"]
          ]
        }`;
};

for (const ep of config.endpoints) {
  if (ep.public) continue;
  if (!ep.input_headers?.includes('Authorization')) continue;

  ep.input_headers = [...new Set([...ep.input_headers, ...propagated])];

  const placeholder = `__JWT_VALIDATOR_${validatorIndex}__`;
  validators.set(placeholder, buildJwtValidatorBlock(ep));
  ep.extra_config = { 'auth/validator': placeholder };
  validatorIndex += 1;
}

let tmpl = JSON.stringify(config, null, 2);

for (const [placeholder, block] of validators) {
  tmpl = tmpl.replace(`"${placeholder}"`, block);
}

const corsBlock = `{
      "allow_origins": [
        {{- $origins := splitList "," (env "CORS_ORIGINS" | default "http://localhost:5173") -}}
        {{- range $index, $origin := $origins -}}
        {{- if $index }},{{ end -}}
        {{ trim $origin " " | quote }}
        {{- end -}}
      ],
      "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      "allow_headers": ["Origin", "Authorization", "Content-Type", "Accept", "Cookie"],
      "expose_headers": ["Content-Length", "Set-Cookie"],
      "max_age": "12h",
      "allow_credentials": true
    }`;

tmpl = tmpl.replace(/"__CORS_ORIGINS__"/g, corsBlock);

fs.writeFileSync(path.join(krakendDir, 'krakend.tmpl'), tmpl);
console.log(`Generated krakend/krakend.tmpl (${validators.size} JWT validators)`);
