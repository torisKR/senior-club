import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareProductionTask } from './prepare-api-task.mjs';

const image = 'registry.example/senior-club-api@sha256:' + 'a'.repeat(64);
function fixture() {
  return {
    family: 'senior-club-api', revision: 23, taskDefinitionArn: 'previous', cpu: '256', memory: '512',
    containerDefinitions: [{ name: 'api', image: 'previous',
      environment: [{ name: 'NODE_ENV', value: 'development' }, { name: 'KAKAO_APP_ID', value: '1539455' }, { name: 'EMAIL_PROVIDER', value: 'console' }, { name: 'FIREBASE_AUTH_EMULATOR_HOST', value: 'localhost:9099' }],
      secrets: ['DATABASE_URL', 'AUTH_ACCESS_TOKEN_SECRET', 'AUTH_OTP_PEPPER', 'AUTH_OTP_ENCRYPTION_KEY_BASE64'].map((name) => ({ name, valueFrom: 'existing-secret-reference' })),
    }],
  };
}
const webOrigins = 'https://senior.toris.kr,https://clubsenior.vercel.app';
test('removes deployment metadata and development channels while preserving encrypted secret references', () => {
  const before = fixture();
  const result = prepareProductionTask(before, { image, webOrigins });
  assert.equal(result.revision, undefined);
  assert.equal(result.taskDefinitionArn, undefined);
  assert.equal(result.containerDefinitions[0].image, image);
  assert.deepEqual(result.containerDefinitions[0].secrets, before.containerDefinitions[0].secrets);
  const env = Object.fromEntries(result.containerDefinitions[0].environment.map(({ name, value }) => [name, value]));
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.AUTH_DEV_OTP_EXPOSE, 'false');
  assert.equal(env.EMAIL_PROVIDER, 'disabled');
  assert.equal(env.SMS_PROVIDER, 'disabled');
  assert.equal(env.FIREBASE_AUTH_EMULATOR_HOST, undefined);
  assert.equal(env.CORS_ORIGINS, webOrigins);
  assert.equal(before.revision, 23);
});
test('fails closed for missing authentication secrets and provider credentials', () => {
  const task = fixture(); task.containerDefinitions[0].secrets = [];
  assert.throws(() => prepareProductionTask(task, { image, webOrigins }), /Missing required production/);
  const mail = fixture(); mail.containerDefinitions[0].environment.push({ name: 'EMAIL_PROVIDER', value: 'resend' });
  assert.throws(() => prepareProductionTask(mail, { image, webOrigins }), /credentials/);
});
test('rejects latest images, wildcard origins and non-HTTPS origins', () => {
  assert.throws(() => prepareProductionTask(fixture(), { image: 'registry.example/senior-club-api:latest', webOrigins }), /versioned/);
  for (const invalid of ['*', 'http://senior.toris.kr', 'https://senior.toris.kr/path', '']) {
    assert.throws(() => prepareProductionTask(fixture(), { image, webOrigins: invalid }), /HTTPS/);
  }
});
