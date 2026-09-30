import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SERVER_FIELDS = ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities', 'registeredAt', 'registeredBy', 'deregisteredAt'];

export function prepareProductionTask(task, { image, containerName = 'api', webOrigins }) {
  if (!/^[\w.-]+(?:\/[-\w.]+)+(?::[\w.-]+|@sha256:[a-f0-9]{64})$/.test(image) || image.endsWith(':latest')) {
    throw new Error('A versioned API image or immutable digest is required.');
  }
  const result = structuredClone(task);
  for (const key of SERVER_FIELDS) delete result[key];
  const container = result.containerDefinitions?.find((entry) => entry.name === containerName);
  if (!container) throw new Error('The configured API container is missing.');
  const environment = new Map((container.environment ?? []).map(({ name, value }) => [name, value]));
  const secretNames = new Set((container.secrets ?? []).map(({ name }) => name));
  const hasCredential = (name) => Boolean(environment.get(name)) || secretNames.has(name);
  if (!/^[1-9]\d*$/.test(environment.get('KAKAO_APP_ID') ?? '')) {
    throw new Error('KAKAO_APP_ID must identify the configured production Kakao application.');
  }
  for (const name of ['AUTH_ACCESS_TOKEN_SECRET', 'AUTH_OTP_PEPPER', 'AUTH_OTP_ENCRYPTION_KEY_BASE64', 'DATABASE_URL']) {
    if (!hasCredential(name)) throw new Error(`Missing required production setting: ${name}`);
  }
  const origins = [...new Set((webOrigins ?? environment.get('CORS_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean))];
  if (!origins.length || origins.some((value) => {
    try { const url = new URL(value); return url.protocol !== 'https:' || url.origin !== value || Boolean(url.username || url.password); }
    catch { return true; }
  })) throw new Error('Production web origins must be explicit HTTPS origins.');

  environment.set('NODE_ENV', 'production');
  environment.set('AUTH_DEV_OTP_EXPOSE', 'false');
  environment.set('CORS_ORIGINS', origins.join(','));
  environment.delete('FIREBASE_AUTH_EMULATOR_HOST');
  environment.delete('GOOGLE_CLIENT_ID');
  for (const [setting, provider, credentials] of [
    ['EMAIL_PROVIDER', 'resend', ['RESEND_API_KEY']],
    ['SMS_PROVIDER', 'twilio', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']],
    ['PUSH_PROVIDER', 'firebase', ['FCM_SERVICE_ACCOUNT_JSON_BASE64']],
  ]) {
    const selected = environment.get(setting);
    if (selected === provider) {
      if (!credentials.every(hasCredential)) throw new Error(`${setting} is configured without its required credentials.`);
    } else if (!selected || selected === 'console' || selected === 'disabled') {
      environment.set(setting, 'disabled');
    } else throw new Error(`Unsupported production provider: ${setting}`);
  }
  container.image = image;
  container.environment = [...environment].map(([name, value]) => ({ name, value }));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, image] = process.argv.slice(2);
  if (!input || !output || !image) throw new Error('Usage: prepare-api-task.mjs INPUT OUTPUT IMAGE');
  const task = prepareProductionTask(JSON.parse(readFileSync(input, 'utf8')), {
    image,
    containerName: process.env.ECS_CONTAINER_NAME ?? 'api',
    webOrigins: process.env.PRODUCTION_WEB_ORIGINS ?? 'https://senior.toris.kr,https://clubsenior.vercel.app',
  });
  writeFileSync(output, JSON.stringify(task, null, 2) + '\n', { mode: 0o600 });
  console.log('Production API task prepared; existing secret references were preserved.');
}
