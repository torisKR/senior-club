import assert from 'node:assert/strict';
import test from 'node:test';
import releaseApiUrl from '../src/config/release-api-url.js';

const { getReleaseApiUrlViolation } = releaseApiUrl;

function violation(candidate) {
  return getReleaseApiUrlViolation(new URL(candidate));
}

test('accepts public HTTPS API hosts', () => {
  for (const candidate of [
    'https://api.seniorclub.kr',
    'https://api.seniorclub.kr/v1',
    'https://8.8.8.8',
    'https://[2001:4860:4860::8888]',
  ]) {
    assert.equal(violation(candidate), null, candidate);
  }
});

test('rejects localhost, reserved names, and placeholders', () => {
  for (const candidate of [
    'https://localhost',
    'https://api.localhost',
    'https://api.invalid',
    'https://api.example',
    'https://api.example.com',
    'https://api.example.net',
    'https://api.example.org',
    'https://api.test',
    'https://api.local',
    'https://api.internal',
    'https://router.home.arpa',
    'https://intranet',
    'https://api.seniorclub.kr.',
  ]) {
    assert.notEqual(violation(candidate), null, candidate);
  }
});

test('rejects non-HTTPS URLs and URL-embedded request data', () => {
  for (const candidate of [
    'http://api.seniorclub.kr',
    'https://user:password@api.seniorclub.kr',
    'https://api.seniorclub.kr?token=value',
    'https://api.seniorclub.kr#fragment',
  ]) {
    assert.notEqual(violation(candidate), null, candidate);
  }
});

test('rejects non-public IPv4 literals including private and link-local ranges', () => {
  for (const candidate of [
    'https://0.0.0.0',
    'https://10.0.2.2',
    'https://100.64.0.1',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://172.16.0.1',
    'https://172.31.255.255',
    'https://192.168.1.1',
    'https://192.0.2.1',
    'https://198.18.0.1',
    'https://198.51.100.1',
    'https://203.0.113.1',
    'https://224.0.0.1',
    'https://255.255.255.255',
    'https://127.1',
    'https://0x7f000001',
  ]) {
    assert.notEqual(violation(candidate), null, candidate);
  }
});

test('rejects non-public IPv6 literals and mapped private IPv4', () => {
  for (const candidate of [
    'https://[::]',
    'https://[::1]',
    'https://[fc00::1]',
    'https://[fd12:3456::1]',
    'https://[fe80::1]',
    'https://[ff02::1]',
    'https://[fec0::1]',
    'https://[2001:db8::1]',
    'https://[3fff::1]',
    'https://[::10.0.2.2]',
    'https://[::ffff:10.0.2.2]',
    'https://[::ffff:127.0.0.1]',
  ]) {
    assert.notEqual(violation(candidate), null, candidate);
  }
});
